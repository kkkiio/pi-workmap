import type { WorkmapNode } from "./types.js";

export interface StateMessageMeta {
	/** Agent turns (turn_end events) since the last workmap call, accumulated across runs. */
	turnsSinceUpdate?: number;
}

/**
 * Render the workmap as a scannable, tree-ordered text listing for the persisted context message.
 * Ids stay inline so the model can target them in update/remove calls. Notes are user-facing
 * alignment rationale and stay out of the message: the model already knows its own reasoning,
 * and durable context is compaction's job, not this snapshot's.
 */
export function renderStateMessage(nodes: WorkmapNode[], meta: StateMessageMeta = {}): string {
	const ids = new Set(nodes.map((node) => node.id));
	const children = new Map<string, WorkmapNode[]>();
	// Heading roots lead the listing: the anchor precedes the details.
	const roots: WorkmapNode[] = [
		...nodes.filter((node) => !(node.parentId && ids.has(node.parentId)) && node.type === "heading"),
		...nodes.filter((node) => !(node.parentId && ids.has(node.parentId)) && node.type !== "heading"),
	];
	for (const node of nodes) {
		if (node.parentId && ids.has(node.parentId)) {
			const siblings = children.get(node.parentId) ?? [];
			siblings.push(node);
			children.set(node.parentId, siblings);
		}
	}
	const lines: string[] = [];
	const visit = (node: WorkmapNode, depth: number): void => {
		const indent = "  ".repeat(depth);
		const status = node.status ? ` [${node.status}]` : "";
		lines.push(`${indent}${node.type} ${node.id}${status}: ${node.title}`);
		for (const child of children.get(node.id) ?? []) visit(child, depth + 1);
	};
	for (const root of roots) visit(root, 0);
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
		"Keep it concise and current with the workmap tool as your heading, understanding, decisions, tasks, or detected drift materially change.",
		"</workmap-state>",
	].join("\n");
}
