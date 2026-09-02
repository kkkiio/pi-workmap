import type { WorkmapChild, WorkmapRoot } from "./types.js";

export interface StateMessageMeta {
	/**
	 * User prompts since the last accepted full `workmap` declaration —
	 * add_drift appends but never re-anchors, so it does not reset this. The
	 * MUST in prompt guidelines lowers forgetting but cannot eliminate it; this
	 * counter makes a missed rewrite visible and escalates when it happens.
	 */
	promptsSinceRewrite: number;
}

/**
 * Render trees as a scannable indented listing. Notes and rationale stay out:
 * the model already knows its own reasoning, and durable context is
 * compaction's job.
 */
export function renderTreeLines(roots: WorkmapRoot[]): string[] {
	// Heading roots lead the listing: the anchor precedes the details.
	const ordered = [
		...roots.filter((root) => root.type === "heading"),
		...roots.filter((root) => root.type !== "heading"),
	];
	const lines: string[] = [];
	const visit = (node: WorkmapChild, depth: number): void => {
		const status = node.status ? ` [${node.status}]` : "";
		lines.push(`${"  ".repeat(depth)}${node.type}${status}: ${node.title}`);
	};
	for (const root of ordered) {
		visit(root, 0);
		for (const child of root.children ?? []) visit(child, 1);
	}
	return lines;
}

/**
 * Render the workmap as the persisted context message, injected fresh on every
 * agent run. The footer restates the two writing surfaces; when the map has
 * gone stale, the footer escalates from routine reminder to pointed notice.
 */
export function renderStateMessage(nodes: WorkmapRoot[], meta: StateMessageMeta): string {
	const stale = meta.promptsSinceRewrite >= 2;
	const footer = stale
		? `The workmap is ${meta.promptsSinceRewrite} user prompts stale — re-declare it with the workmap tool before acting.`
		: "Re-declare this map with the workmap tool on every user prompt; add_drift the moment you change course mid-task.";
	return [
		"<workmap-state>",
		"Live state of the shared working model you maintain for this session; a state anchor, not conversation to react to.",
		"",
		...renderTreeLines(nodes),
		"",
		footer,
		"</workmap-state>",
	].join("\n");
}
