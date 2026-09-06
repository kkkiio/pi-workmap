import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { WORKMAP_NODE_TYPES, type WorkmapNodeType } from "./node-types.js";
import { readLatestSnapshot } from "./session-entry.js";
import { countNodes, type WorkmapChild, type WorkmapGoal, type WorkmapRoot, type WorkmapView } from "./types.js";

/**
 * The UI invariant the schema's declaration shape (roots ≤ 8, children ≤ 4)
 * cannot guarantee: the widget renders every node, so the total must stay
 * bounded (ADR 0015). set and add_drift share this one number.
 */
export const MAX_WORKMAP_NODES = 10;
/** Declaration shape, mirrored by the set schema (ADR 0015). */
export const MAX_ROOTS = 8;
export const MAX_CHILDREN = 4;
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
 * The in-memory workmap: a goal header plus an ordered list of root-level
 * signals. The signals are a regenerated projection of the Agent's working
 * model — every mutation is a whole-map declaration, no incremental addressing,
 * no eviction (ADR 0015). The goal is separate: written only through `set_goal`
 * and stable across signal rewrites (ADR 0017). The state layer only backstops
 * the UI invariant and validates structure for the restore path, which bypasses
 * the tool schema; everything semantic is wording, never validation (ADR 0015).
 */
export class WorkmapState {
	private goal: WorkmapGoal | undefined;
	private roots: WorkmapRoot[] = [];

	view(): WorkmapView {
		return {
			...(this.goal ? { goal: structuredClone(this.goal) } : {}),
			nodes: structuredClone(this.roots),
		};
	}

	/** Drops everything, including the goal header — a new session starts blank. */
	clear(): boolean {
		if (this.roots.length === 0 && !this.goal) return false;
		this.goal = undefined;
		this.roots = [];
		return true;
	}

	/** Restore the newest snapshot that passes validation; none leaves an empty map. */
	restore(sessionManager: Pick<ExtensionContext["sessionManager"], "getEntries">): void {
		const snapshot = readLatestSnapshot(
			sessionManager,
			(candidates) => this.validateNodes(candidates) === undefined && countNodes(candidates) <= MAX_WORKMAP_NODES,
		);
		if (!snapshot) {
			this.goal = undefined;
			this.roots = [];
			return;
		}
		this.goal = snapshot.goal;
		this.roots = snapshot.nodes;
	}

	/**
	 * Full signal-map declaration: replaces the node list, atomically. The goal
	 * header is not part of this list — `set_goal` owns it (ADR 0017). Structure
	 * is validated and the ≤10 UI invariant backstops the declaration shape; the
	 * Agent decides what to drop, the mechanism never silently prunes.
	 */
	set(nodes: WorkmapRoot[]): WorkmapResult {
		const nodeError = this.validateNodes(nodes ?? []);
		if (nodeError) return { changed: false, error: nodeError };
		const next = (nodes ?? []).map((node) => sanitizeNode(node));
		if (countNodes(next) > MAX_WORKMAP_NODES) {
			return {
				changed: false,
				error: `The map is limited to ${MAX_WORKMAP_NODES} nodes (children included) — keep the ones that matter most and re-declare`,
			};
		}
		const changed = JSON.stringify(next) !== JSON.stringify(this.roots);
		if (changed) this.roots = next;
		return { changed };
	}

	/**
	 * Distill the user's ultimate want into the goal header — the destination,
	 * never the route (ADR 0017). The only writer of the goal slot; stable
	 * across signal rewrites.
	 */
	setGoal(title: string, label?: string): WorkmapResult {
		const goal = sanitizeGoal({ title, label });
		const titleError = checkTitle(goal.title);
		if (titleError) return { changed: false, error: titleError };
		if (goal.label && goal.label.length > 24) return { changed: false, error: "invalid label" };
		const changed = JSON.stringify(goal) !== JSON.stringify(this.goal);
		if (changed) this.goal = goal;
		return { changed };
	}

	/**
	 * Record one drift mid-loop — appended to the state, hoisted right below
	 * the goal header in every rendering. Works on an empty map (a drift may
	 * open one, ADR 0015); the only rejection is the shared ≤10 invariant.
	 */
	addDrift(title: string): WorkmapResult {
		const node = sanitizeNode({ type: "drift", title, label: "detected" });
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

	/** Structure validation for the restore path, which bypasses the tool schema. */
	private validateNodes(nodes: WorkmapRoot[]): string | undefined {
		if (!Array.isArray(nodes)) return "nodes must be an array";
		if (nodes.length > MAX_ROOTS) {
			return `The map allows at most ${MAX_ROOTS} root signals — keep the ones that matter most and re-declare`;
		}
		for (const raw of nodes) {
			if (!raw || typeof raw !== "object") return "Every workmap root must be an object";
			const nodeError = validateNode(raw as WorkmapRoot, 1);
			if (nodeError) return nodeError;
		}
		return undefined;
	}
}

function checkTitle(title: string): string | undefined {
	if (typeof title !== "string" || !title.trim() || title.length > 120) return "invalid title";
	return undefined;
}

function validateNode(node: Partial<WorkmapRoot>, depth: number): string | undefined {
	if (!WORKMAP_NODE_TYPES.includes(node.type as WorkmapNodeType)) return "invalid node type";
	const titleError = checkTitle(node.title as string);
	if (titleError) return titleError;
	if (node.label !== undefined && (typeof node.label !== "string" || node.label.length > 24)) {
		return "invalid label";
	}
	if (node.children === undefined) return undefined;
	if (!Array.isArray(node.children)) return "children must be an array";
	if (node.children.length > MAX_CHILDREN) {
		return `Each root allows at most ${MAX_CHILDREN} children — keep the supporting evidence that matters`;
	}
	if (depth >= MAX_WORKMAP_DEPTH) return `nesting deeper than ${MAX_WORKMAP_DEPTH} levels`;
	for (const child of node.children) {
		if (!child || typeof child !== "object") return "every child must be an object";
		const childError = validateNode(child as Partial<WorkmapChild>, depth + 1);
		if (childError) return childError;
	}
	return undefined;
}

function clean(text: string): string {
	return text
		.replace(/[\u0000-\u001f\u007f]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function sanitizeGoal({ title, label }: WorkmapGoal): WorkmapGoal {
	return {
		title: clean(title),
		...(label?.trim() ? { label: clean(label) } : {}),
	};
}

function sanitizeNode(node: WorkmapRoot): WorkmapRoot {
	return {
		type: node.type,
		title: clean(node.title),
		...(node.label?.trim() ? { label: clean(node.label) } : {}),
		...(node.children && node.children.length > 0
			? { children: node.children.map((child) => sanitizeNode(child as WorkmapRoot)) }
			: {}),
	};
}
