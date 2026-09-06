import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WorkmapView } from "./types.js";

export const WORKMAP_ENTRY_TYPE = "pi-workmap-state";
export const WORKMAP_SNAPSHOT_VERSION = 7;
export interface WorkmapSnapshot extends WorkmapView {
	version: typeof WORKMAP_SNAPSHOT_VERSION;
}

/** Appended snapshots are session-global, independent of the active tree branch. */
export function persistSnapshot(pi: Pick<ExtensionAPI, "appendEntry">, view: WorkmapView): void {
	pi.appendEntry<WorkmapSnapshot>(WORKMAP_ENTRY_TYPE, {
		version: WORKMAP_SNAPSHOT_VERSION,
		...structuredClone(view),
	});
}

/** Restore the newest valid map; v4–v6 lift the first goal and rename status to label. */
export function readLatestSnapshot(
	sessionManager: Pick<ExtensionContext["sessionManager"], "getEntries">,
	validate: (value: unknown) => WorkmapView | string,
): WorkmapView | undefined {
	const entries = sessionManager.getEntries();
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry.type !== "custom" || entry.customType !== WORKMAP_ENTRY_TYPE) continue;
		const data = entry.data;
		if (!data || typeof data !== "object" || !("version" in data) || !("nodes" in data)) continue;
		if (!Array.isArray(data.nodes)) continue;
		let goal: unknown = "goal" in data ? data.goal : undefined;
		let nodes: unknown[] = data.nodes;
		if (data.version !== WORKMAP_SNAPSHOT_VERSION) {
			if (data.version !== 4 && data.version !== 5 && data.version !== 6) continue;
			const migrated: unknown[] = [];
			let malformed = false;
			for (const raw of nodes) {
				if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
					malformed = true;
					break;
				}
				const { status, children, ...node } = raw as Record<string, unknown>;
				if (node.type === "goal" || (data.version === 4 && node.type === "heading")) {
					goal ??= { title: node.title, ...(status ? { label: status } : {}) };
					continue;
				}
				if (children !== undefined && !Array.isArray(children)) {
					malformed = true;
					break;
				}
				const root = {
					...node,
					...(status ? { label: status } : {}),
					...(children ? { children: [...children] } : {}),
				};
				const leaves = root.children ?? [];
				for (let childIndex = 0; childIndex < leaves.length; childIndex += 1) {
					const child = leaves[childIndex];
					if (!child || typeof child !== "object" || Array.isArray(child)) {
						malformed = true;
						break;
					}
					const { status: childStatus, ...leaf } = child;
					leaves[childIndex] = { ...leaf, ...(childStatus ? { label: childStatus } : {}) };
				}
				if (malformed) break;
				migrated.push(root);
			}
			if (malformed) continue;
			nodes = migrated;
		}
		const result = validate({ ...(goal !== undefined ? { goal } : {}), nodes });
		if (typeof result !== "string") return result;
	}
	return undefined;
}
