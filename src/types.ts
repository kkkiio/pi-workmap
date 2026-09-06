import type { Static } from "typebox";
import type { ChildSchema, GoalSchema, RootSchema, WorkmapSchema } from "./node-types.js";

export type WorkmapChild = Static<typeof ChildSchema>;
export type WorkmapRoot = Static<typeof RootSchema>;
export type WorkmapGoal = Static<typeof GoalSchema>;
export type WorkmapView = Static<typeof WorkmapSchema>;

export interface WorkmapToolDetails extends WorkmapView {
	version: 7;
	action: "set" | "set_goal" | "add";
	changed: boolean;
	error?: string;
}

export function countNodes(view: WorkmapView): number {
	let total = view.nodes.length + (view.goal ? 1 : 0);
	for (const root of view.nodes) total += root.children?.length ?? 0;
	return total;
}
