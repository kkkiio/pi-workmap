import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { WORKMAP_NODE_TYPES, type WorkmapNode, type WorkmapSnapshot } from "./types.js";

export const WORKMAP_ENTRY_TYPE = "pi-workmap-state";
export const MAX_WORKMAP_NODES = 32;
const SEMANTIC_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export class WorkmapState {
	private nodes: WorkmapNode[] = [];

	list(): WorkmapNode[] {
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
			if (data?.version !== 1 || !Array.isArray(data.nodes)) continue;
			// Legacy snapshots may carry removed types; map them so released session
			// data stays resumable: unknown → understanding, goal/direction → heading.
			const migrated = (data.nodes as Array<Partial<WorkmapNode>>).map((node) => {
				if (node?.type === ("unknown" as WorkmapNode["type"])) return { ...node, type: "understanding" as const };
				if (node?.type === ("goal" as WorkmapNode["type"]) || node?.type === ("direction" as WorkmapNode["type"]))
					return { ...node, type: "heading" as const };
				return node;
			});
			const result = this.validate(migrated as unknown[]);
			if (typeof result === "string") continue;
			this.nodes = result;
			return;
		}
		this.nodes = [];
	}

	persist(pi: ExtensionAPI): void {
		pi.appendEntry<WorkmapSnapshot>(WORKMAP_ENTRY_TYPE, {
			version: 1,
			nodes: this.list(),
		});
	}

	update(upserts: WorkmapNode[], removeIds: string[]): { changed: boolean; error?: string } {
		const duplicateUpsert = upserts.find(
			(node, index) => upserts.findIndex((candidate) => candidate.id === node.id) !== index,
		);
		if (duplicateUpsert) return { changed: false, error: `Duplicate node id: ${duplicateUpsert.id}` };
		const removals = new Set(removeIds);
		const next = this.nodes.filter((node) => !removals.has(node.id)).map((node) => ({ ...node }));

		for (const raw of upserts) {
			const node: WorkmapNode = {
				id: raw.id.trim(),
				type: raw.type,
				title: raw.title
					.replace(/[\u0000-\u001f\u007f]/g, " ")
					.replace(/\s+/g, " ")
					.trim(),
				...(raw.status?.trim()
					? {
							status: raw.status
								.replace(/[\u0000-\u001f\u007f]/g, " ")
								.replace(/\s+/g, " ")
								.trim(),
						}
					: {}),
				...(raw.note?.trim()
					? {
							note: raw.note
								.replace(/[\u0000-\u001f\u007f]/g, " ")
								.replace(/\s+/g, " ")
								.trim(),
						}
					: {}),
				...(raw.parentId?.trim() ? { parentId: raw.parentId.trim() } : {}),
			};
			const existing = next.findIndex((candidate) => candidate.id === node.id);
			if (existing >= 0) next[existing] = node;
			else next.push(node);
		}

		const validated = this.validate(next);
		if (typeof validated === "string") return { changed: false, error: validated };
		const changed = JSON.stringify(validated) !== JSON.stringify(this.nodes);
		if (changed) this.nodes = validated;
		return { changed };
	}

	private validate(value: unknown[]): WorkmapNode[] | string {
		if (value.length > MAX_WORKMAP_NODES) return `Workmap is limited to ${MAX_WORKMAP_NODES} current nodes`;
		const nodes: WorkmapNode[] = [];
		const ids = new Set<string>();
		for (const raw of value) {
			if (!raw || typeof raw !== "object") return "Every workmap node must be an object";
			const candidate = raw as Partial<WorkmapNode>;
			if (typeof candidate.id !== "string" || !SEMANTIC_ID.test(candidate.id))
				return `Invalid semantic id: ${candidate.id ?? "missing"}`;
			if (ids.has(candidate.id)) return `Duplicate node id: ${candidate.id}`;
			if (!WORKMAP_NODE_TYPES.includes(candidate.type as WorkmapNode["type"]))
				return `Invalid node type for ${candidate.id}`;
			if (typeof candidate.title !== "string" || !candidate.title.trim() || candidate.title.length > 120)
				return `Invalid title for ${candidate.id}`;
			if (candidate.status !== undefined && (typeof candidate.status !== "string" || candidate.status.length > 24))
				return `Invalid status for ${candidate.id}`;
			if (candidate.note !== undefined && (typeof candidate.note !== "string" || candidate.note.length > 280))
				return `Invalid note for ${candidate.id}`;
			if (candidate.parentId !== undefined && typeof candidate.parentId !== "string")
				return `Invalid parentId for ${candidate.id}`;
			ids.add(candidate.id);
			nodes.push({ ...candidate } as WorkmapNode);
		}

		for (const node of nodes) {
			if (!node.parentId) continue;
			if (!ids.has(node.parentId)) return `Parent ${node.parentId} does not exist for ${node.id}`;
			const seen = new Set([node.id]);
			let parentId: string | undefined = node.parentId;
			while (parentId) {
				if (seen.has(parentId)) return `Parent cycle includes ${node.id}`;
				seen.add(parentId);
				parentId = nodes.find((candidate) => candidate.id === parentId)?.parentId;
			}
		}
		return nodes.map((node) => ({ ...node }));
	}
}
