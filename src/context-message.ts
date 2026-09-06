import type { WorkmapChild, WorkmapRoot, WorkmapView } from "./types.js";

/**
 * Drift roots follow the separate goal row; other roots keep insertion order.
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

/** Current state, injected before each agent run. */
export function renderStateMessage(view: WorkmapView): string {
	const { goal, nodes } = view;
	return [
		"<workmap-state>",
		...(goal ? [`goal${goal.label ? ` [${goal.label}]` : ""}: ${goal.title}`] : []),
		...renderTreeLines(nodes),
		"</workmap-state>",
	].join("\n");
}
