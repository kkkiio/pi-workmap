import type { WorkmapChild, WorkmapGoal, WorkmapRoot } from "./types.js";

export interface StateMessageMeta {
	/**
	 * User prompts since the last accepted full `restate` declaration —
	 * add_drift appends but never re-anchors, so it does not reset this. The
	 * MUST in prompt guidelines lowers forgetting but cannot eliminate it; this
	 * counter makes a missed rewrite visible and escalates when it happens.
	 */
	promptsSinceRewrite: number;
}

/**
 * Display order for roots: drift leads (the goal header sits above the tree;
 * the user's first question after "is the direction right" is "where did we
 * stray"), the rest keeps insertion order.
 */
export function orderedRoots(roots: WorkmapRoot[]): WorkmapRoot[] {
	return [...roots.filter((root) => root.type === "drift"), ...roots.filter((root) => root.type !== "drift")];
}

/**
 * Render trees as a scannable indented listing. Notes and rationale stay out:
 * the model already knows its own reasoning, and durable context is
 * compaction's job.
 */
export function renderTreeLines(roots: WorkmapRoot[]): string[] {
	const ordered = orderedRoots(roots);
	const lines: string[] = [];
	const visit = (node: WorkmapChild, depth: number): void => {
		const label = node.label ? ` [${node.label}]` : "";
		lines.push(`${"  ".repeat(depth)}${node.type}${label}: ${node.title}`);
	};
	for (const root of ordered) {
		visit(root, 0);
		for (const child of root.children ?? []) visit(child, 1);
	}
	return lines;
}

/**
 * Render the workmap as the persisted context message, injected fresh on every
 * agent run. The goal header leads when present; the footer restates the two
 * writing surfaces, and escalates from routine reminder to pointed notice when
 * the map has gone stale.
 */
export function renderStateMessage(
	nodes: WorkmapRoot[],
	goal: WorkmapGoal | undefined,
	meta: StateMessageMeta,
): string {
	const stale = meta.promptsSinceRewrite >= 2;
	const footer = stale
		? `The workmap is ${meta.promptsSinceRewrite} user prompts stale — restate it before acting.`
		: "Restate this map on every user prompt; add_drift the moment you change course mid-task.";
	return [
		"<workmap-state>",
		...(goal ? ["", `goal${goal.label ? ` [${goal.label}]` : ""}: ${goal.title}`] : []),
		"",
		...renderTreeLines(nodes),
		"",
		footer,
		"</workmap-state>",
	].join("\n");
}
