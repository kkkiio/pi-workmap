export const WORKMAP_NODE_TYPES = ["heading", "understanding", "decision", "option", "task", "drift"] as const;

export type WorkmapNodeType = (typeof WORKMAP_NODE_TYPES)[number];

/** A nested signal. Children carry no id: trees are the only addressable unit. */
export interface WorkmapChild {
	type: WorkmapNodeType;
	title: string;
	status?: string;
	note?: string;
	children?: WorkmapChild[];
}

/** A top-level tree root — the only node with a stable, targetable id. */
export interface WorkmapRoot extends WorkmapChild {
	id: string;
}

export interface WorkmapSnapshot {
	version: 2;
	nodes: WorkmapRoot[];
}

export interface WorkmapToolDetails {
	version: 2;
	action: "view" | "update" | "clear";
	changed: boolean;
	error?: string;
	nodes: WorkmapRoot[];
}

export function countNodes(nodes: WorkmapChild[]): number {
	let total = 0;
	const stack = [...nodes];
	while (stack.length > 0) {
		const node = stack.pop() as WorkmapChild;
		total += 1;
		if (node.children) stack.push(...node.children);
	}
	return total;
}
