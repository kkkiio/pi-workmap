import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { WORKMAP_ENTRY_TYPE, WORKMAP_SNAPSHOT_VERSION, type WorkmapSnapshot } from "../src/session-entry.js";
import { MAX_ROOTS, MAX_WORKMAP_NODES, WorkmapState } from "../src/state.js";
import type { WorkmapRoot } from "../src/types.js";

const decision: WorkmapRoot = { type: "decision", title: "Which label vocabulary survives?", label: "considering" };
const understanding: WorkmapRoot = { type: "understanding", title: "Tree navigation must not roll back the map" };

/** A valid base map, ready for extras. */
function baseMap(): WorkmapRoot[] {
	return [decision, { ...understanding }];
}

function tree(title: string, childCount = 0): WorkmapRoot {
	return {
		type: "task",
		title,
		...(childCount > 0
			? {
					children: Array.from({ length: childCount }, (_, index) => ({
						type: "task" as const,
						title: `${title} ${index}`,
					})),
				}
			: {}),
	};
}

function fullMap(): WorkmapRoot[] {
	return [tree("Head", 4), tree("Tail", 3), tree("Last")];
}

function sessionWith(entries: SessionEntry[]): ExtensionContext["sessionManager"] {
	return {
		getEntries: vi.fn(() => entries),
	} as unknown as ExtensionContext["sessionManager"];
}

function snapshotEntry(nodes: unknown, goal?: unknown): SessionEntry {
	return {
		type: "custom",
		id: "entry-0",
		parentId: null,
		timestamp: new Date(0).toISOString(),
		customType: WORKMAP_ENTRY_TYPE,
		data: { version: WORKMAP_SNAPSHOT_VERSION, ...(goal ? { goal } : {}), nodes },
	} as unknown as SessionEntry;
}

describe("WorkmapState.set", () => {
	it("replaces the whole signal map atomically", () => {
		const state = new WorkmapState();
		expect(state.set(baseMap())).toEqual({ changed: true });

		expect(state.set([decision, { ...understanding, title: "Branch navigation is session-global" }])).toEqual({
			changed: true,
		});
		expect(state.view().nodes).toEqual([
			decision,
			{ type: "understanding", title: "Branch navigation is session-global" },
		]);
	});

	it("treats a byte-identical re-declaration as no change", () => {
		const state = new WorkmapState();
		state.set(baseMap());
		expect(state.set(structuredClone(baseMap()))).toEqual({ changed: false });
	});

	it("clears with an empty array and leaves the goal alone", () => {
		const state = new WorkmapState();
		state.set(baseMap());
		state.setGoal("Keep the auth layer trustworthy");
		expect(state.set([])).toEqual({ changed: true });
		expect(state.view().nodes).toEqual([]);
		expect(state.view().goal?.title).toBe("Keep the auth layer trustworthy");
		expect(state.set([])).toEqual({ changed: false });
	});

	it("rejects over-capacity maps instead of evicting", () => {
		const state = new WorkmapState();
		const result = state.set([tree("Head", 4), tree("Tail", 4), ...baseMap()]);
		expect(result.changed).toBe(false);
		expect(result.error).toContain("limited to 10 signals");
		expect(state.view().nodes).toEqual([]);
	});

	it("rejects more than 8 roots", () => {
		const state = new WorkmapState();
		const result = state.set(Array.from({ length: MAX_ROOTS + 1 }, (_, index) => tree(`Root ${index}`)));
		expect(result.error).toContain("at most 8 root signals");
	});

	it("rejects more than 4 children per root", () => {
		const state = new WorkmapState();
		const result = state.set([tree("Huge", 5)]);
		expect(result.error).toContain("at most 4 children");
	});

	it("rejects nesting deeper than two levels", () => {
		const state = new WorkmapState();
		const deep = {
			...decision,
			title: "Deep",
			children: [{ type: "task", title: "Child", children: [{ type: "task", title: "Grandchild" }] }],
		} as WorkmapRoot;
		expect(state.set([deep]).error).toContain("nesting deeper than 2 levels");
	});

	it("rejects invalid nodes without changing state", () => {
		const state = new WorkmapState();
		state.set(baseMap());
		expect(state.set([{ ...decision, type: "nonsense" as never }]).error).toContain("invalid node type");
		expect(state.set([{ ...decision, title: "" }]).error).toContain("invalid title");
		expect(state.view().nodes).toEqual(baseMap());
	});

	it("sanitizes control characters and drops empty children", () => {
		const state = new WorkmapState();
		state.set([{ ...decision, title: "Fix\tthe  flaky\nauth test", label: "  considering  ", children: [] }]);
		expect(state.view().nodes[0]?.title).toBe("Fix the flaky auth test");
		expect(state.view().nodes[0]?.label).toBe("considering");
		expect(state.view().nodes[0]?.children).toBeUndefined();
	});
});

describe("WorkmapState.setGoal", () => {
	it("distills the goal header and keeps it across signal rewrites", () => {
		const state = new WorkmapState();
		expect(state.setGoal("Stop random logouts", "long-term")).toEqual({ changed: true });
		expect(state.view().goal).toEqual({ title: "Stop random logouts", label: "long-term" });

		state.set(baseMap());
		expect(state.view().goal?.title).toBe("Stop random logouts");
	});

	it("treats a byte-identical goal as no change", () => {
		const state = new WorkmapState();
		state.setGoal("Stop random logouts");
		expect(state.setGoal("Stop random logouts")).toEqual({ changed: false });
		expect(state.setGoal("Stop random logouts", "long-term")).toEqual({ changed: true });
	});

	it("rejects an empty or over-long title", () => {
		const state = new WorkmapState();
		expect(state.setGoal("").error).toContain("invalid title");
		expect(state.setGoal("x".repeat(121)).error).toContain("invalid title");
	});

	it("rejects an over-long label", () => {
		const state = new WorkmapState();
		expect(state.setGoal("Valid", "x".repeat(25)).error).toContain("invalid label");
	});
});

describe("WorkmapState.addDrift", () => {
	it("appends a drift with the detected label", () => {
		const state = new WorkmapState();
		state.set(baseMap());
		expect(state.addDrift("Implementation is becoming a todo manager")).toEqual({ changed: true });
		expect(state.view().nodes.at(-1)).toEqual({
			type: "drift",
			title: "Implementation is becoming a todo manager",
			label: "detected",
		});
	});

	it("opens a map from empty: a drift may start one", () => {
		const state = new WorkmapState();
		expect(state.addDrift("Off course")).toEqual({ changed: true });
		expect(state.view().nodes).toEqual([{ type: "drift", title: "Off course", label: "detected" }]);
	});

	it("rejects at capacity instead of evicting", () => {
		const state = new WorkmapState();
		state.set(fullMap());
		const result = state.addDrift("Off course");
		expect(result.error).toContain("full (10 signals)");
		expect(state.view().nodes).toEqual(fullMap());
	});
});

describe("WorkmapState.restore", () => {
	it("restores the latest snapshot rather than the active branch", () => {
		const oldSnapshot: WorkmapSnapshot = { version: WORKMAP_SNAPSHOT_VERSION, nodes: baseMap() };
		const latestSnapshot: WorkmapSnapshot = {
			version: WORKMAP_SNAPSHOT_VERSION,
			nodes: [...baseMap(), { type: "drift", title: "Implementation follows an obsolete decision", label: "detected" }],
		};
		const entries = [oldSnapshot, latestSnapshot].map(
			(data, index) =>
				({
					type: "custom",
					id: `entry-${index}`,
					parentId: index === 0 ? null : "different-branch",
					timestamp: new Date(index).toISOString(),
					customType: WORKMAP_ENTRY_TYPE,
					data,
				}) as SessionEntry,
		);
		const state = new WorkmapState();

		state.restore(sessionWith(entries));

		expect(state.view().nodes).toEqual(latestSnapshot.nodes);
	});

	it("restores the goal header", () => {
		const state = new WorkmapState();
		state.restore(sessionWith([snapshotEntry(baseMap(), { title: "Stop random logouts", label: "long-term" })]));
		expect(state.view().goal).toEqual({ title: "Stop random logouts", label: "long-term" });
	});

	it("starts empty without snapshots", () => {
		const state = new WorkmapState();
		state.set(baseMap());
		state.setGoal("Stop random logouts");
		state.restore(sessionWith([]));
		expect(state.view()).toEqual({ nodes: [] });
	});

	it("falls back to the previous snapshot when the newest is semantically invalid", () => {
		const state = new WorkmapState();
		state.restore(sessionWith([snapshotEntry(baseMap()), snapshotEntry([{ type: "task", title: "" }])]));
		expect(state.view().nodes).toEqual(baseMap());
	});

	it("skips snapshots with malformed nodes instead of crashing", () => {
		const state = new WorkmapState();
		state.restore(sessionWith([snapshotEntry([null, decision])]));
		expect(state.view().nodes).toEqual([]);
	});

	it("skips over-capacity snapshots", () => {
		const state = new WorkmapState();
		state.restore(sessionWith([snapshotEntry([tree("Huge", MAX_WORKMAP_NODES), ...baseMap()])]));
		expect(state.view().nodes).toEqual([]);
	});

	it("migrates v6 goal roots into the header and renames status to label", () => {
		const state = new WorkmapState();
		state.restore(
			sessionWith([
				{
					type: "custom",
					id: "entry-0",
					parentId: null,
					timestamp: new Date(0).toISOString(),
					customType: WORKMAP_ENTRY_TYPE,
					data: {
						version: 6,
						nodes: [
							{ type: "goal", title: "Stop random logouts", status: "long-term" },
							{ type: "task", title: "Migrate the snapshot format", status: "active" },
						],
					},
				} as unknown as SessionEntry,
			]),
		);
		expect(state.view().goal).toEqual({ title: "Stop random logouts", label: "long-term" });
		expect(state.view().nodes).toEqual([{ type: "task", title: "Migrate the snapshot format", label: "active" }]);
	});

	it("migrates v4 heading lineage through the same path", () => {
		const state = new WorkmapState();
		state.restore(
			sessionWith([
				{
					type: "custom",
					id: "entry-0",
					parentId: null,
					timestamp: new Date(0).toISOString(),
					customType: WORKMAP_ENTRY_TYPE,
					data: {
						version: 4,
						nodes: [
							{ type: "heading", title: "Keep the auth layer trustworthy", status: "long-term" },
							{ type: "task", title: "Legacy task", status: "pending" },
						],
					},
				} as unknown as SessionEntry,
			]),
		);
		expect(state.view().goal).toEqual({ title: "Keep the auth layer trustworthy", label: "long-term" });
		expect(state.view().nodes).toEqual([{ type: "task", title: "Legacy task", label: "pending" }]);
	});

	it("skips legacy snapshot versions older than the migration window", () => {
		const state = new WorkmapState();
		state.restore(
			sessionWith([
				{
					type: "custom",
					id: "entry-0",
					parentId: null,
					timestamp: new Date(0).toISOString(),
					customType: WORKMAP_ENTRY_TYPE,
					data: { version: 3, nodes: [{ id: "old", type: "task", title: "Legacy" }] },
				} as unknown as SessionEntry,
			]),
		);
		expect(state.view().nodes).toEqual([]);
	});
});
