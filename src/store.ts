import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Compile } from "typebox/compile";
import { RootSchema, SetGoalParams } from "./agent_api.js";
import { readLatestSnapshot } from "./session-entry.js";
import { countNodes, type WorkmapGoal, type WorkmapRoot, type WorkmapView } from "./types.js";

/**
 * The UI invariant the schema's declaration shape (roots ≤ 8, children ≤ 4)
 * cannot guarantee: the widget renders every node, so the total must stay
 * bounded (ADR 0015). restate and add_drift share this one number, and the
 * goal is a signal — the count includes it.
 */
export const MAX_WORKMAP_SIGNALS = 10;

/** Structure check for the restore path, which bypasses the tool schema (ADR 0015). */
const isSignalTree = Compile(Type.Array(RootSchema, { maxItems: 8 }));
const isGoalParams = Compile(SetGoalParams);

export interface WorkmapResult {
	changed: boolean;
	error?: string;
}

/**
 * The store: a goal header plus an ordered list of root-level signals. The
 * signals are a regenerated projection of the Agent's working model — every
 * mutation is a whole-map declaration, no incremental addressing, no eviction
 * (ADR 0015). The goal is separate: written only through `set_goal` and stable
 * across signal rewrites (ADR 0017). The store owns nothing semantic — it
 * holds the values, accepts declarations at its boundary, and maintains one
 * invariant: total signals ≤ 10.
 */
export class WorkmapStore {
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
			(nodes) => isSignalTree.Check(nodes) && countNodes(nodes) <= MAX_WORKMAP_SIGNALS,
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
	 * header is not part of this list — `set_goal` owns it (ADR 0017).
	 */
	set(nodes: WorkmapRoot[]): WorkmapResult {
		if (!isSignalTree.Check(nodes ?? [])) {
			return { changed: false, error: "The signal tree violates its schema — check types, titles, labels and depth" };
		}
		const next = (nodes ?? []).map((node) => sanitizeNode(node));
		if (next.some((node) => !node.title)) return { changed: false, error: "invalid title" };
		if (this.totalSignals(next) > MAX_WORKMAP_SIGNALS) {
			return {
				changed: false,
				error: `The map is limited to ${MAX_WORKMAP_SIGNALS} signals (goal and children included) — keep the ones that matter most and restate`,
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
		if (!isGoalParams.Check({ title, ...(label ? { label } : {}) })) {
			return { changed: false, error: "invalid goal — check title length (1–120) and label length (≤ 24)" };
		}
		const goal = sanitizeGoal({ title, label });
		if (!goal.title) return { changed: false, error: "invalid title" };
		const changed = JSON.stringify(goal) !== JSON.stringify(this.goal);
		if (changed) this.goal = goal;
		return { changed };
	}

	/**
	 * Record one drift mid-loop — appended to the state, hoisted right below
	 * the goal row in every rendering. Works on an empty map (a drift may open
	 * one, ADR 0015); the only rejection is the shared ≤10 invariant.
	 */
	addDrift(title: string): WorkmapResult {
		const node = sanitizeNode({ type: "drift", title, label: "detected" });
		if (!isSignalTree.Check([node]) || this.totalSignals([...this.roots, node]) > MAX_WORKMAP_SIGNALS) {
			return {
				changed: false,
				error: `The map is full (${MAX_WORKMAP_SIGNALS} signals) — restate the map to make room`,
			};
		}
		this.roots.push(node);
		return { changed: true };
	}

	private totalSignals(nodes: WorkmapRoot[]): number {
		return countNodes(nodes) + (this.goal ? 1 : 0);
	}
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
