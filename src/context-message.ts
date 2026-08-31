import type { WorkmapChild, WorkmapRoot } from "./types.js";

export interface StateMessageMeta {
	/** Agent turns (turn_end events) since the last workmap call, accumulated across runs. */
	turnsSinceUpdate?: number;
}

/**
 * Render trees as a scannable indented listing. Root ids stay inline so the model can
 * target them in update/remove calls; children have no id and are addressed by
 * replacing their tree. Notes are user-facing alignment rationale and stay out: the
 * model already knows its own reasoning, and durable context is compaction's job.
 */
export function renderTreeLines(roots: WorkmapRoot[]): string[] {
	// Heading roots lead the listing: the anchor precedes the details.
	const ordered = [
		...roots.filter((root) => root.type === "heading"),
		...roots.filter((root) => root.type !== "heading"),
	];
	const lines: string[] = [];
	const visit = (node: WorkmapChild, depth: number, id?: string): void => {
		const indent = "  ".repeat(depth);
		const status = node.status ? ` [${node.status}]` : "";
		lines.push(`${indent}${node.type}${id ? ` ${id}` : ""}${status}: ${node.title}`);
		for (const child of node.children ?? []) visit(child, depth + 1);
	};
	for (const root of ordered) visit(root, 0, root.id);
	return lines;
}

/**
 * Render the workmap as the persisted context message.
 */
export function renderStateMessage(nodes: WorkmapRoot[], meta: StateMessageMeta = {}): string {
	const lines = renderTreeLines(nodes);
	// A bare counter, not persuasion: the footer already carries the standing instruction,
	// and the number lets the model see the anchor going stale (ADR 0010).
	const staleness =
		meta.turnsSinceUpdate === undefined
			? undefined
			: `Last workmap update: ${meta.turnsSinceUpdate} turn${meta.turnsSinceUpdate === 1 ? "" : "s"} ago.`;
	return [
		"<workmap-state>",
		"Live state of the shared working model you maintain for this session; a state anchor, not conversation to react to.",
		"",
		...lines,
		...(staleness ? ["", staleness] : []),
		"",
		"Keep it concise and current with the workmap tool as your direction materially changes: heading before investigating, updates as you learn — not after you finish.",
		"</workmap-state>",
	].join("\n");
}
