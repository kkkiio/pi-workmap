import type { WorkmapNodeType } from "./node-types.js";

/** A supporting signal nested under a root. Children are leaves: the map is two layers deep. */
export interface WorkmapChild {
	type: WorkmapNodeType;
	title: string;
	status?: string;
}

/** A root-level signal — the only layer allowed to carry children (ADR 0015). */
export interface WorkmapRoot extends WorkmapChild {
	children?: WorkmapChild[];
}

export interface WorkmapToolDetails {
	version: 5;
	action: "set" | "add";
	changed: boolean;
	error?: string;
	nodes: WorkmapRoot[];
}

export function countNodes(roots: WorkmapRoot[]): number {
	let total = roots.length;
	for (const root of roots) total += root.children?.length ?? 0;
	return total;
}
