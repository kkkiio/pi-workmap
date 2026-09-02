import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { WORKMAP_ENTRY_TYPE, WORKMAP_SNAPSHOT_VERSION, type WorkmapSnapshot } from "../src/session-entry.js";
import { MAX_WORKMAP_NODES, WorkmapState } from "../src/state.js";
import type { WorkmapRoot } from "../src/types.js";

const currentHeading: WorkmapRoot = { type: "heading", title: "Stop random logouts", status: "current" };
const longTermHeading: WorkmapRoot = { type: "heading", title: "Keep the auth layer trustworthy", status: "long-term" };

/** A valid two-heading base map, ready for extras. */
function baseMap(): WorkmapRoot[] {
	return [longTermHeading, { ...currentHeading }];
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
	return [...baseMap(), ...Array.from({ length: MAX_WORKMAP_NODES - 2 }, (_, index) => tree(`Filler ${index}`))];
}

function sessionWith(entries: SessionEntry[]): ExtensionContext["sessionManager"] {
	return {
		getEntries: vi.fn(() => entries),
	} as unknown as ExtensionContext["sessionManager"];
}

function snapshotEntry(nodes: unknown): SessionEntry {
	return {
		type: "custom",
		id: "entry-0",
		parentId: null,
		timestamp: new Date(0).toISOString(),
		customType: WORKMAP_ENTRY_TYPE,
		data: { version: WORKMAP_SNAPSHOT_VERSION, nodes },
	} as unknown as SessionEntry;
}

describe("WorkmapState.set", () => {
	it("replaces the whole map atomically", () => {
		const state = new WorkmapState();
		expect(state.set(baseMap())).toEqual({ changed: true });

		expect(state.set([longTermHeading, { ...currentHeading, title: "Fix the flaky auth test" }])).toEqual({
			changed: true,
		});
		expect(state.list()).toEqual([
			longTermHeading,
			{ type: "heading", title: "Fix the flaky auth test", status: "current" },
		]);
	});

	it("treats a byte-identical re-declaration as no change", () => {
		const state = new WorkmapState();
		state.set(baseMap());
		expect(state.set(structuredClone(baseMap()))).toEqual({ changed: false });
	});

	it("clears with an empty array", () => {
		const state = new WorkmapState();
		state.set(baseMap());
		expect(state.set([])).toEqual({ changed: true });
		expect(state.list()).toEqual([]);
		expect(state.set([])).toEqual({ changed: false });
	});

	it("rejects a non-empty map without a long-term heading", () => {
		const state = new WorkmapState();
		const expected =
			'A non-empty map needs a heading with status "long-term" — the project-level goal this session serves.';
		expect(state.set([{ ...currentHeading }]).error).toBe(expected);

		// A single long-term heading is a valid map on its own.
		expect(state.set([longTermHeading])).toEqual({ changed: true });
		expect(state.set([{ ...longTermHeading, type: "task", title: "Not a heading" }]).error).toBe(expected);
		expect(state.list()).toEqual([longTermHeading]);
	});

	it("rejects over-capacity maps instead of evicting", () => {
		const state = new WorkmapState();
		const result = state.set([tree("Huge", MAX_WORKMAP_NODES - 2), ...baseMap()]);
		expect(result.changed).toBe(false);
		expect(result.error).toContain("limited to 10 nodes");
		expect(state.list()).toEqual([]);
	});

	it("rejects nesting deeper than two levels", () => {
		const state = new WorkmapState();
		const deep = {
			...currentHeading,
			title: "Deep",
			children: [{ type: "task", title: "Child", children: [{ type: "task", title: "Grandchild" }] }],
		} as WorkmapRoot;
		expect(state.set([longTermHeading, deep]).error).toContain("nesting deeper than 2 levels");
	});

	it("rejects invalid nodes without changing state", () => {
		const state = new WorkmapState();
		state.set(baseMap());
		expect(state.set([longTermHeading, { ...currentHeading, type: "nonsense" as never }]).error).toContain(
			"invalid node type",
		);
		expect(state.set([longTermHeading, { ...currentHeading, title: "" }]).error).toContain("invalid title");
		expect(state.list()).toEqual(baseMap());
	});

	it("sanitizes control characters and drops empty children", () => {
		const state = new WorkmapState();
		state.set([longTermHeading, { ...currentHeading, title: "Fix\tthe  flaky\nauth test", children: [] }]);
		expect(state.list()[1]?.title).toBe("Fix the flaky auth test");
		expect(state.list()[1]?.children).toBeUndefined();
	});
});

describe("WorkmapState.addDrift", () => {
	it("appends a drift with the detected status", () => {
		const state = new WorkmapState();
		state.set(baseMap());
		expect(state.addDrift("Implementation is becoming a todo manager")).toEqual({ changed: true });
		expect(state.list().at(-1)).toEqual({
			type: "drift",
			title: "Implementation is becoming a todo manager",
			status: "detected",
		});
	});

	it("rejects on an empty map: a lone drift cannot open one", () => {
		const state = new WorkmapState();
		expect(state.addDrift("Off course").error).toContain("empty");
		expect(state.list()).toEqual([]);
	});

	it("rejects at capacity instead of evicting", () => {
		const state = new WorkmapState();
		state.set(fullMap());
		const result = state.addDrift("Off course");
		expect(result.error).toContain("full (10 nodes)");
		expect(state.list()).toEqual(fullMap());
	});
});

describe("WorkmapState.restore", () => {
	it("restores the latest snapshot rather than the active branch", () => {
		const oldSnapshot: WorkmapSnapshot = { version: WORKMAP_SNAPSHOT_VERSION, nodes: baseMap() };
		const latestSnapshot: WorkmapSnapshot = {
			version: WORKMAP_SNAPSHOT_VERSION,
			nodes: [
				...baseMap(),
				{ type: "drift", title: "Implementation follows an obsolete decision", status: "detected" },
			],
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

		expect(state.list()).toEqual(latestSnapshot.nodes);
	});

	it("starts empty without snapshots", () => {
		const state = new WorkmapState();
		state.set(baseMap());
		state.restore(sessionWith([]));
		expect(state.list()).toEqual([]);
	});

	it("falls back to the previous snapshot when the newest is semantically invalid", () => {
		const state = new WorkmapState();
		state.restore(
			sessionWith([snapshotEntry(baseMap()), snapshotEntry([{ type: "task", title: "Hand-edited, no headings" }])]),
		);
		expect(state.list()).toEqual(baseMap());
	});

	it("skips snapshots with malformed nodes instead of crashing", () => {
		const state = new WorkmapState();
		state.restore(sessionWith([snapshotEntry([null, currentHeading])]));
		expect(state.list()).toEqual([]);
	});

	it("skips over-capacity snapshots", () => {
		const state = new WorkmapState();
		state.restore(sessionWith([snapshotEntry([tree("Huge", MAX_WORKMAP_NODES), ...baseMap()])]));
		expect(state.list()).toEqual([]);
	});

	it("skips snapshots violating the long-term anchor", () => {
		const state = new WorkmapState();
		state.restore(sessionWith([snapshotEntry([{ type: "task", title: "No heading here" }])]));
		expect(state.list()).toEqual([]);
	});

	it("skips legacy snapshot versions: workmap state is ephemeral by design", () => {
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
		expect(state.list()).toEqual([]);
	});
});
