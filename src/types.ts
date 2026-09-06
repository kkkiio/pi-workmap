import type { WorkmapNodeType } from "./agent_api.js";

/** A supporting signal nested under a root. Children are leaves: the map is two layers deep. */
export interface WorkmapChild {
	type: WorkmapNodeType;
	title: string;
	label?: string;
}

/** A root-level signal — the only layer allowed to carry children (ADR 0015). */
export interface WorkmapRoot extends WorkmapChild {
	children?: WorkmapChild[];
}

/** The intent header: written only through `set_goal`, rendered above the tree (ADR 0017). */
export interface WorkmapGoal {
	title: string;
	label?: string;
}

/** What the workmap carries: the intent header plus the signal tree. */
export interface WorkmapView {
	goal?: WorkmapGoal;
	nodes: WorkmapRoot[];
}

export interface WorkmapToolDetails {
	version: 7;
	action: "set" | "add" | "set_goal";
	changed: boolean;
	error?: string;
	goal?: WorkmapGoal;
	nodes: WorkmapRoot[];
}

export function countNodes(roots: WorkmapRoot[]): number {
	let total = roots.length;
	for (const root of roots) total += root.children?.length ?? 0;
	return total;
}
