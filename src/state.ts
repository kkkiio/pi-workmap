import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	countNodes,
	type EvictedRoot,
	WORKMAP_NODE_TYPES,
	type WorkmapChild,
	type WorkmapNodeType,
	type WorkmapRoot,
	type WorkmapSnapshot,
	type WorkmapSnapshotNode,
} from "./types.js";

export const WORKMAP_ENTRY_TYPE = "pi-workmap-state";
export const MAX_WORKMAP_NODES = 10;
// Depth is enforced on tool calls by the provider-facing schema unroll (index.ts);
// restore() bypasses that schema, so validate() still checks it at runtime.
// Three levels: root, children, grandchildren (ADR 0013).
export const MAX_WORKMAP_DEPTH = 3;
const SEMANTIC_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/**
 * A live signal whose silent loss would kill an open thread: drift awaiting user
 * response, a decision still under deliberation, or blocked work. Trees carrying
 * one are evicted last (ADR 0013).
 */
function hasLiveSignal(node: WorkmapChild): boolean {
	if (node.type === "drift") return true;
	if (node.type === "decision" && node.status === "considering") return true;
	if (node.type === "task" && node.status === "blocked") return true;
	for (const child of node.children ?? []) if (hasLiveSignal(child)) return true;
	return false;
}

interface StoredEntry {
	root: WorkmapRoot;
	updatedAt: number;
}

export class WorkmapState {
	private entries: StoredEntry[] = [];

	list(): WorkmapRoot[] {
		return this.entries.map((entry) => ({ ...entry.root }));
	}

	clear(): boolean {
		if (this.entries.length === 0) return false;
		this.entries = [];
		return true;
	}

	restore(sessionManager: Pick<ExtensionContext["sessionManager"], "getEntries">): void {
		const entries = sessionManager.getEntries();
		for (let index = entries.length - 1; index >= 0; index -= 1) {
			const entry = entries[index];
			if (entry.type !== "custom" || entry.customType !== WORKMAP_ENTRY_TYPE) continue;
			const data = entry.data as Partial<WorkmapSnapshot> | undefined;
			// Snapshots predating the current schema are skipped without migration:
			// the package was never published, and workmap state is ephemeral by design.
			if (data?.version !== 3 || !Array.isArray(data.nodes)) continue;
			const storedNodes: WorkmapSnapshotNode[] = data.nodes;
			// Guard before destructuring: a malformed node (e.g. null) must skip the
			// snapshot, not crash session start.
			if (storedNodes.some((node) => !node || typeof node !== "object")) continue;
			const result = this.validate(storedNodes.map(({ updatedAt: _age, ...root }) => root));
			if (typeof result === "string") continue;
			const now = Date.now();
			this.entries = result.map((root, position) => {
				const stored = storedNodes[position]?.updatedAt;
				return { root, updatedAt: typeof stored === "number" ? stored : now };
			});
			// Restore bypasses update-time eviction, so enforce the cap here too:
			// externally produced or edited snapshots must not exceed the widget's
			// height contract (evicted trees are dropped silently).
			this.entries = evictToCapacity(this.entries, MAX_WORKMAP_NODES).kept;
			return;
		}
		this.entries = [];
	}

	persist(pi: ExtensionAPI): void {
		pi.appendEntry<WorkmapSnapshot>(WORKMAP_ENTRY_TYPE, {
			version: 3,
			nodes: this.entries.map((entry) => ({ ...entry.root, updatedAt: entry.updatedAt })),
		});
	}

	/**
	 * Tree-granular mutation: every upsert replaces the whole tree under its root id
	 * (position preserved) and refreshes its age; remove ids address roots only. A
	 * root sent without its children drops them — replacement, not merge.
	 *
	 * Overflow never errors: when the map would exceed MAX_WORKMAP_NODES, whole trees
	 * are evicted oldest-first (no-live-signal trees first, live-signal trees last,
	 * freshly upserted trees never) and reported back as EvictedRoot (ADR 0013). The
	 * single error case is an update that exceeds capacity even on an empty map.
	 */
	update(
		upserts: WorkmapRoot[],
		removeIds: string[],
		now: number = Date.now(),
	): { changed: boolean; error?: string; evicted?: EvictedRoot[] } {
		const duplicateUpsert = upserts.find(
			(node, index) => upserts.findIndex((candidate) => candidate.id === node.id) !== index,
		);
		if (duplicateUpsert) return { changed: false, error: `Duplicate root id: ${duplicateUpsert.id}` };
		// Check raw upserts before sanitize strips unknown fields: a child carrying an id
		// signals the caller expected per-node addressing, which this schema does not have.
		const idScan: WorkmapChild[] = upserts.flatMap((root) => root.children ?? []);
		while (idScan.length > 0) {
			const node = idScan.pop() as WorkmapChild;
			if (typeof (node as WorkmapRoot).id === "string")
				return { changed: false, error: "Children must not carry ids; only roots are addressable" };
			if (node.children) idScan.push(...node.children);
		}
		const removals = new Set(removeIds);
		let next: StoredEntry[] = this.entries.filter((entry) => !removals.has(entry.root.id));
		for (const raw of upserts) {
			const root: WorkmapRoot = {
				id: raw.id.trim(),
				...sanitizeChild(raw),
			};
			const stored: StoredEntry = { root, updatedAt: now };
			const existing = next.findIndex((entry) => entry.root.id === root.id);
			if (existing >= 0) next[existing] = stored;
			else next.push(stored);
		}
		const validated = this.validate(next.map((entry) => entry.root));
		if (typeof validated === "string") return { changed: false, error: validated };
		next = next.map((entry, index) => ({ ...entry, root: validated[index] as WorkmapRoot }));

		let total = countNodes(validated);
		let evicted: EvictedRoot[] = [];
		if (total > MAX_WORKMAP_NODES) {
			// Trees upserted in this call are the caller's freshest declarations and
			// are never eviction candidates.
			const fresh = new Set(upserts.map((node) => node.id.trim()));
			const freshNodes = countNodes(next.filter((entry) => fresh.has(entry.root.id)).map((entry) => entry.root));
			const outcome = evictToCapacity(
				next.filter((entry) => !fresh.has(entry.root.id)),
				MAX_WORKMAP_NODES - freshNodes,
			);
			evicted = outcome.evicted;
			if (evicted.length > 0) {
				const evictedIds = new Set(evicted.map((node) => node.id));
				next = next.filter((entry) => !evictedIds.has(entry.root.id));
				total = countNodes(next.map((entry) => entry.root));
			}
			if (total > MAX_WORKMAP_NODES) {
				return {
					changed: false,
					error: `Upsert exceeds the ${MAX_WORKMAP_NODES}-node capacity even with every prior tree evicted; split it into smaller trees`,
				};
			}
		}

		// Compare stored entries, not just displayed content: a byte-identical
		// re-upsert still refreshes the tree's age (ADR 0013), and that age-only
		// change must be assigned and persisted.
		const changed = JSON.stringify(next) !== JSON.stringify(this.entries);
		if (changed) this.entries = next;
		return { changed, ...(evicted.length > 0 ? { evicted } : {}) };
	}

	private validate(value: unknown[]): WorkmapRoot[] | string {
		const roots: WorkmapRoot[] = [];
		const ids = new Set<string>();
		for (const raw of value) {
			if (!raw || typeof raw !== "object") return "Every workmap root must be an object";
			const candidate = raw as Partial<WorkmapRoot>;
			if (typeof candidate.id !== "string" || !SEMANTIC_ID.test(candidate.id))
				return `Invalid semantic id: ${candidate.id ?? "missing"}`;
			if (ids.has(candidate.id)) return `Duplicate root id: ${candidate.id}`;
			const error = validateNode(candidate, 1);
			if (error) return `Root ${candidate.id}: ${error}`;
			ids.add(candidate.id);
			roots.push({ ...candidate } as WorkmapRoot);
		}
		return roots;
	}
}

/**
 * Evict whole trees oldest-first until the map fits the capacity: trees whose
 * subtree carries no live signal go first, live-signal trees last (ADR 0013).
 */
function evictToCapacity(entries: StoredEntry[], capacity: number): { kept: StoredEntry[]; evicted: EvictedRoot[] } {
	let total = countNodes(entries.map((entry) => entry.root));
	const evicted: EvictedRoot[] = [];
	if (total <= capacity) return { kept: entries, evicted };
	// Stable sorts turn equal updatedAt values into position-order tiebreaks.
	const byAge = (left: StoredEntry, right: StoredEntry): number => left.updatedAt - right.updatedAt;
	const order = [
		...entries.filter((entry) => !hasLiveSignal(entry.root)).sort(byAge),
		...entries.filter((entry) => hasLiveSignal(entry.root)).sort(byAge),
	];
	for (const entry of order) {
		if (total <= capacity) break;
		total -= countNodes([entry.root]);
		evicted.push({ id: entry.root.id, title: entry.root.title });
	}
	const evictedIds = new Set(evicted.map((node) => node.id));
	return { kept: entries.filter((entry) => !evictedIds.has(entry.root.id)), evicted };
}

function validateNode(node: Partial<WorkmapChild>, depth: number): string | undefined {
	if (!WORKMAP_NODE_TYPES.includes(node.type as WorkmapNodeType)) return "invalid node type";
	if (typeof node.title !== "string" || !node.title.trim() || node.title.length > 120) return "invalid title";
	if (node.status !== undefined && (typeof node.status !== "string" || node.status.length > 24))
		return "invalid status";
	if (node.children === undefined) return undefined;
	if (!Array.isArray(node.children)) return "children must be an array";
	if (depth >= MAX_WORKMAP_DEPTH) return `nesting deeper than ${MAX_WORKMAP_DEPTH} levels`;
	for (const child of node.children) {
		if (!child || typeof child !== "object") return "every child must be an object";
		if (typeof (child as WorkmapRoot).id === "string") return "children must not carry ids; only roots are addressable";
		const error = validateNode(child, depth + 1);
		if (error) return error;
	}
	return undefined;
}

function sanitizeChild(node: WorkmapChild): WorkmapChild {
	const clean = (text: string) =>
		text
			.replace(/[\u0000-\u001f\u007f]/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	return {
		type: node.type,
		title: clean(node.title),
		...(node.status?.trim() ? { status: clean(node.status) } : {}),
		...(node.children && node.children.length > 0 ? { children: node.children.map(sanitizeChild) } : {}),
	};
}
