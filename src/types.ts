export const WORKMAP_NODE_TYPES = ["goal", "understanding", "unknown", "decision", "option", "task", "drift"] as const;

export type WorkmapNodeType = (typeof WORKMAP_NODE_TYPES)[number];

export interface WorkmapNode {
	id: string;
	type: WorkmapNodeType;
	title: string;
	status?: string;
	note?: string;
	parentId?: string;
}

export interface WorkmapSnapshot {
	version: 1;
	nodes: WorkmapNode[];
}

export interface WorkmapToolDetails extends WorkmapSnapshot {
	action: "view" | "update" | "clear";
	changed: boolean;
	error?: string;
}
