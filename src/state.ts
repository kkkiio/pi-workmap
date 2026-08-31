import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	countNodes,
	WORKMAP_NODE_TYPES,
	type WorkmapChild,
	type WorkmapNodeType,
	type WorkmapRoot,
	type WorkmapSnapshot,
} from "./types.js";

export const WORKMAP_ENTRY_TYPE = "pi-workmap-state";
export const MAX_WORKMAP_NODES = 32;
export const MAX_WORKMAP_DEPTH = 8;
const SEMANTIC_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export class WorkmapState {
	private nodes: WorkmapRoot[] = [];

	list(): WorkmapRoot[] {
		return this.nodes.map((node) => ({ ...node }));
	}

	clear(): boolean {
		if (this.nodes.length === 0) return false;
		this.nodes = [];
		return true;
	}

	restore(sessionManager: Pick<ExtensionContext["sessionManager"], "getEntries">): void {
		const entries = sessionManager.getEntries();
		for (let index = entries.length - 1; index >= 0; index -= 1) {
			const entry = entries[index];
			if (entry.type !== "custom" || entry.customType !== WORKMAP_ENTRY_TYPE) continue;
			const data = entry.data as Partial<WorkmapSnapshot> | undefined;
			// Legacy flat snapshots predate the nested schema and are simply skipped:
			// the package was never published, so no released session data needs migration.
			if (data?.version !== 2 || !Array.isArray(data.nodes)) continue;
			const result = this.validate(data.nodes);
			if (typeof result === "string") continue;
			this.nodes = result;
			return;
		}
		this.nodes = [];
	}

	persist(pi: ExtensionAPI): void {
		pi.appendEntry<WorkmapSnapshot>(WORKMAP_ENTRY_TYPE, {
			version: 2,
			nodes: this.list(),
		});
	}

	/**
	 * Tree-granular mutation: every upsert replaces the whole tree under its root id
	 * (position preserved), and remove ids address roots only. A root sent without
	 * its children drops them — replacement, not merge.
	 */
	update(upserts: WorkmapRoot[], removeIds: string[]): { changed: boolean; error?: string } {
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
		const next = this.nodes.filter((node) => !removals.has(node.id)).map((node) => ({ ...node }));

		for (const raw of upserts) {
			const root: WorkmapRoot = {
				id: raw.id.trim(),
				...sanitizeChild(raw),
			};
			const existing = next.findIndex((candidate) => candidate.id === root.id);
			if (existing >= 0) next[existing] = root;
			else next.push(root);
		}

		const validated = this.validate(next);
		if (typeof validated === "string") return { changed: false, error: validated };
		const changed = JSON.stringify(validated) !== JSON.stringify(this.nodes);
		if (changed) this.nodes = validated;
		return { changed };
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
		if (countNodes(roots) > MAX_WORKMAP_NODES) return `Workmap is limited to ${MAX_WORKMAP_NODES} current nodes`;
		return roots;
	}
}

function validateNode(node: Partial<WorkmapChild>, depth: number): string | undefined {
	if (!WORKMAP_NODE_TYPES.includes(node.type as WorkmapNodeType)) return "invalid node type";
	if (typeof node.title !== "string" || !node.title.trim() || node.title.length > 120) return "invalid title";
	if (node.status !== undefined && (typeof node.status !== "string" || node.status.length > 24))
		return "invalid status";
	if (node.note !== undefined && (typeof node.note !== "string" || node.note.length > 280)) return "invalid note";
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
		...(node.note?.trim() ? { note: clean(node.note) } : {}),
		...(node.children && node.children.length > 0 ? { children: node.children.map(sanitizeChild) } : {}),
	};
}
