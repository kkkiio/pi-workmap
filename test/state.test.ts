import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { MAX_WORKMAP_DEPTH, WORKMAP_ENTRY_TYPE, WorkmapState } from "../src/state.js";
import type { WorkmapRoot, WorkmapSnapshot } from "../src/types.js";

const goal: WorkmapRoot = { id: "fix_auth", type: "heading", title: "Stop random logouts", status: "current" };

function sessionWith(entries: SessionEntry[]): ExtensionContext["sessionManager"] {
	return {
		getEntries: vi.fn(() => entries),
	} as unknown as ExtensionContext["sessionManager"];
}

describe("WorkmapState", () => {
	it("upserts whole trees by root id and preserves their position", () => {
		const state = new WorkmapState();
		expect(
			state.update(
				[
					goal,
					{
						id: "refresh_race",
						type: "task",
						title: "Check whether refresh can race across workers",
						children: [{ type: "task", title: "Trace worker IDs" }],
					},
				],
				[],
			),
		).toEqual({ changed: true });

		expect(state.update([{ ...goal, title: "Keep users signed in" }], [])).toEqual({ changed: true });
		expect(state.list().map((node) => node.id)).toEqual(["fix_auth", "refresh_race"]);
		expect(state.list()[0]?.title).toBe("Keep users signed in");
		expect(state.list()[1]?.children).toHaveLength(1);
	});

	it("replaces the entire subtree when a root is re-upserted", () => {
		const state = new WorkmapState();
		state.update([{ ...goal, children: [{ type: "task", title: "Old child" }] }], []);

		state.update([goal], []);

		expect(state.list()[0]?.children).toBeUndefined();
	});

	it("removes whole trees by root id", () => {
		const state = new WorkmapState();
		state.update([goal, { id: "side_quest", type: "task", title: "Polish glyphs" }], []);

		expect(state.update([], ["side_quest"])).toEqual({ changed: true });
		expect(state.update([], ["missing"])).toEqual({ changed: false });
		expect(state.list().map((node) => node.id)).toEqual(["fix_auth"]);
	});

	it("rejects invalid roots, child ids, and excessive depth without changing state", () => {
		const state = new WorkmapState();
		state.update([goal], []);

		expect(state.update([{ id: "Fix Auth", type: "heading", title: "Bad id" }], []).error).toContain(
			"Invalid semantic id",
		);
		expect(
			state.update(
				[{ id: "ok_id", type: "task", title: "T", children: [{ id: "nested", type: "task", title: "C" } as never] }],
				[],
			).error,
		).toContain("must not carry ids");

		const deep: WorkmapRoot = { id: "deep", type: "task", title: "root" };
		let cursor = deep;
		for (let level = 2; level <= MAX_WORKMAP_DEPTH + 1; level += 1) {
			cursor.children = [{ type: "task", title: `level ${level}` }];
			cursor = cursor.children[0] as WorkmapRoot;
		}
		expect(state.update([deep], []).error).toContain("nesting");
		expect(state.list()).toEqual([goal]);
	});

	it("restores the latest v2 snapshot from the whole session rather than the active branch", () => {
		const oldSnapshot: WorkmapSnapshot = { version: 2, nodes: [goal] };
		const latestSnapshot: WorkmapSnapshot = {
			version: 2,
			nodes: [{ id: "new_direction", type: "drift", title: "Implementation follows an obsolete decision" }],
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

	it("skips legacy v1 snapshots: workmap state is ephemeral by design", () => {
		const v1Snapshot = {
			version: 1,
			nodes: [goal, { id: "child", type: "task", title: "Flat child", parentId: "fix_auth" }],
		};
		const entries = [
			{
				type: "custom",
				id: "entry-0",
				parentId: null,
				timestamp: new Date(0).toISOString(),
				customType: WORKMAP_ENTRY_TYPE,
				data: v1Snapshot,
			} as SessionEntry,
		];
		const state = new WorkmapState();

		state.restore(sessionWith(entries));

		expect(state.list()).toEqual([]);
	});
});
