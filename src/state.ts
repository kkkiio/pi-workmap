import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Compile } from "typebox/compile";
import { WorkmapSchema } from "./node-types.js";
import { readLatestSnapshot } from "./session-entry.js";
import { countNodes, type WorkmapView } from "./types.js";

export const MAX_WORKMAP_NODES = 10;
const schema = Compile(WorkmapSchema);

export interface WorkmapResult {
	changed: boolean;
	error?: string;
}

/** Session-global state. Every write validates the complete prospective map. */
export class WorkmapState {
	private current: WorkmapView = { nodes: [] };

	view(): WorkmapView {
		return structuredClone(this.current);
	}

	clear(): void {
		this.current = { nodes: [] };
	}

	restore(sessionManager: Pick<ExtensionContext["sessionManager"], "getEntries">): void {
		this.current = readLatestSnapshot(sessionManager, (value) => this.validate(value)) ?? { nodes: [] };
	}

	set(value: WorkmapView): WorkmapResult {
		const next = this.validate(value);
		if (typeof next === "string") return { changed: false, error: next };
		const changed = JSON.stringify(next) !== JSON.stringify(this.current);
		if (changed) this.current = next;
		return { changed };
	}

	private validate(value: unknown): WorkmapView | string {
		if (!schema.Check(value)) {
			return "The workmap violates its schema — check types, titles, labels, depth, and that an option sits under its decision";
		}
		const next = structuredClone(value);
		const nodes = [
			...(next.goal ? [next.goal] : []),
			...next.nodes.flatMap((root) => [root, ...(root.children ?? [])]),
		];
		for (const node of nodes) {
			node.title = node.title
				.replace(/[\u0000-\u001f\u007f]/g, " ")
				.replace(/\s+/g, " ")
				.trim();
			if (!node.title) return "invalid title";
			const label = node.label
				?.replace(/[\u0000-\u001f\u007f]/g, " ")
				.replace(/\s+/g, " ")
				.trim();
			if (label) node.label = label;
			else delete node.label;
		}
		for (const root of next.nodes) {
			if (root.children?.length === 0) delete root.children;
			if (root.type !== "decision" && root.children?.some((child) => child.type === "option")) {
				return "Options only belong under a decision — move the option under its decision, or restate it as an understanding";
			}
		}
		if (countNodes(next) > MAX_WORKMAP_NODES) {
			return `The map is limited to ${MAX_WORKMAP_NODES} nodes (goal and children included) — keep the ones that matter most and restate`;
		}
		return next;
	}
}
