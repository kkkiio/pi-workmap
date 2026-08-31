import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { WORKMAP_ENTRY_TYPE, WorkmapState } from "../src/state.js";
import type { WorkmapNode, WorkmapSnapshot } from "../src/types.js";

const goal: WorkmapNode = { id: "fix_auth", type: "goal", title: "Stop random logouts", status: "current" };

function sessionWith(entries: SessionEntry[]): ExtensionContext["sessionManager"] {
	return {
		getEntries: vi.fn(() => entries),
	} as unknown as ExtensionContext["sessionManager"];
}

describe("WorkmapState", () => {
	it("atomically upserts semantic nodes and preserves their order", () => {
		const state = new WorkmapState();
		expect(
			state.update(
				[
					goal,
					{ id: "refresh_race", type: "unknown", title: "Can refresh race across workers?", parentId: "fix_auth" },
				],
				[],
			),
		).toEqual({ changed: true });

		expect(state.update([{ ...goal, title: "Keep users signed in" }], [])).toEqual({ changed: true });
		expect(state.list().map((node) => node.id)).toEqual(["fix_auth", "refresh_race"]);
		expect(state.list()[0]?.title).toBe("Keep users signed in");
	});

	it("rejects invalid ids, missing parents, and cycles without changing state", () => {
		const state = new WorkmapState();
		state.update([goal], []);

		expect(state.update([{ id: "Fix Auth", type: "goal", title: "Bad id" }], []).error).toContain(
			"Invalid semantic id",
		);
		expect(state.update([{ id: "orphan", type: "task", title: "Orphan", parentId: "missing" }], []).error).toContain(
			"does not exist",
		);
		expect(
			state.update(
				[
					{ id: "left", type: "decision", title: "Left", parentId: "right" },
					{ id: "right", type: "option", title: "Right", parentId: "left" },
				],
				[],
			).error,
		).toContain("cycle");
		expect(state.list()).toEqual([goal]);
	});

	it("restores the latest snapshot from the whole session rather than the active branch", () => {
		const oldSnapshot: WorkmapSnapshot = { version: 1, nodes: [goal] };
		const latestSnapshot: WorkmapSnapshot = {
			version: 1,
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
});
