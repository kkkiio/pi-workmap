import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { REQUIRED_HEADING_STATUSES, WORKMAP_NODE_TYPES, type WorkmapNodeType } from "./node-types.js";
import { readLatestSnapshot } from "./session-entry.js";
import { countNodes, type WorkmapChild, type WorkmapRoot } from "./types.js";

export const MAX_WORKMAP_NODES = 10;
/**
 * Two layers: a root-level signal plus its supporting evidence. Tool calls are
 * bounded by the provider-facing schema (index.ts); restore() bypasses that
 * schema, so validate() still enforces the depth at runtime (ADR 0015).
 */
export const MAX_WORKMAP_DEPTH = 2;

export interface WorkmapResult {
	changed: boolean;
	error?: string;
}

/**
 * The in-memory workmap: an ordered list of root-level signals. Every mutation
 * is a whole-map declaration — there is no incremental addressing, no eviction,
 * and no per-tree age; the map is a regenerated projection of the Agent's
 * working model, not an accumulated store (ADR 0015).
 */
export class WorkmapState {
	private roots: WorkmapRoot[] = [];

	list(): WorkmapRoot[] {
		return structuredClone(this.roots);
	}

	clear(): boolean {
		if (this.roots.length === 0) return false;
		this.roots = [];
		return true;
	}

	/** Restore the newest valid snapshot; anything invalid leaves an empty map. */
	restore(sessionManager: Pick<ExtensionContext["sessionManager"], "getEntries">): void {
		const nodes = readLatestSnapshot(sessionManager);
		if (!nodes) {
			this.roots = [];
			return;
		}
		const validated = this.validate(nodes as WorkmapRoot[]);
		this.roots = typeof validated === "string" ? [] : validated;
	}

	/**
	 * Full-map declaration: replaces everything, atomically. A non-empty set
	 * must carry the double heading (enforced here, not by prompt discipline),
	 * and capacity is a hard rejection — the Agent decides what to drop, the
	 * mechanism never silently prunes.
	 */
	set(nodes: WorkmapRoot[]): WorkmapResult {
		const validated = this.validate(nodes);
		if (typeof validated === "string") return { changed: false, error: validated };
		const changed = JSON.stringify(validated) !== JSON.stringify(this.roots);
		if (changed) this.roots = validated;
		return { changed };
	}

	/**
	 * Append one drift mid-loop — the cheap escape hatch for course changes
	 * that would otherwise be lost before the next full rewrite. Rejected on an
	 * empty map (a lone drift cannot open one) and at capacity.
	 */
	addDrift(title: string): WorkmapResult {
		if (this.roots.length === 0) {
			return { changed: false, error: "The workmap is empty — declare it with the workmap tool first" };
		}
		const node = sanitizeNode({ type: "drift", title, status: "detected" });
		const nodeError = validateNode(node, 1);
		if (nodeError) return { changed: false, error: nodeError };
		if (countNodes([...this.roots, node]) > MAX_WORKMAP_NODES) {
			return {
				changed: false,
				error: `The map is full (${MAX_WORKMAP_NODES} nodes) — re-declare it with the workmap tool to make room`,
			};
		}
		this.roots.push(node);
		return { changed: true };
	}

	private validate(value: WorkmapRoot[]): WorkmapRoot[] | string {
		if (value.length > MAX_WORKMAP_NODES) {
			return `The map is limited to ${MAX_WORKMAP_NODES} nodes — keep the ones that matter most and re-declare`;
		}
		const roots: WorkmapRoot[] = [];
		for (const raw of value) {
			if (!raw || typeof raw !== "object") return "Every workmap root must be an object";
			const nodeError = validateNode(raw as WorkmapRoot, 1);
			if (nodeError) return nodeError;
			roots.push(sanitizeNode(raw as WorkmapRoot));
		}
		if (countNodes(roots) > MAX_WORKMAP_NODES) {
			return `The map is limited to ${MAX_WORKMAP_NODES} nodes (children included) — keep the ones that matter most and re-declare`;
		}
		if (roots.length > 0) {
			for (const status of REQUIRED_HEADING_STATUSES) {
				if (!roots.some((root) => root.type === "heading" && root.status === status)) {
					return `A non-empty map needs a ${status} heading`;
				}
			}
		}
		return roots;
	}
}

function validateNode(node: Partial<WorkmapRoot>, depth: number): string | undefined {
	if (!WORKMAP_NODE_TYPES.includes(node.type as WorkmapNodeType)) return "invalid node type";
	if (typeof node.title !== "string" || !node.title.trim() || node.title.length > 120) return "invalid title";
	if (node.status !== undefined && (typeof node.status !== "string" || node.status.length > 24)) {
		return "invalid status";
	}
	if (node.children === undefined) return undefined;
	if (!Array.isArray(node.children)) return "children must be an array";
	if (depth >= MAX_WORKMAP_DEPTH) return `nesting deeper than ${MAX_WORKMAP_DEPTH} levels`;
	for (const child of node.children) {
		if (!child || typeof child !== "object") return "every child must be an object";
		const childError = validateNode(child as Partial<WorkmapChild>, depth + 1);
		if (childError) return childError;
	}
	return undefined;
}

function sanitizeNode(node: WorkmapRoot): WorkmapRoot {
	const clean = (text: string) =>
		text
			.replace(/[\u0000-\u001f\u007f]/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	return {
		type: node.type,
		title: clean(node.title),
		...(node.status?.trim() ? { status: clean(node.status) } : {}),
		...(node.children && node.children.length > 0
			? { children: node.children.map((child) => sanitizeNode(child as WorkmapRoot)) }
			: {}),
	};
}
