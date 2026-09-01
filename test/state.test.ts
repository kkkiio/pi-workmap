import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { MAX_WORKMAP_NODES, WORKMAP_ENTRY_TYPE, WorkmapState } from "../src/state.js";
import type { WorkmapRoot, WorkmapSnapshot } from "../src/types.js";

const goal: WorkmapRoot = { id: "fix_auth", type: "heading", title: "Stop random logouts", status: "current" };

function tree(id: string, childCount: number): WorkmapRoot {
	return {
		id,
		type: "task",
		title: `Tree ${id}`,
		children: Array.from({ length: childCount }, (_, index) => ({ type: "task", title: `${id} child ${index}` })),
	};
}

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

	it("rejects invalid roots and child ids without changing state", () => {
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
		expect(state.list()).toEqual([goal]);
	});

	it("never accepts notes: the field was removed from the schema (ADR 0013)", () => {
		const state = new WorkmapState();
		const withNote = { ...goal, note: "stale field" } as WorkmapRoot;
		state.update([withNote], []);
		expect(state.list()[0]).toEqual(goal);
	});

	it("evicts the oldest live-signal-free tree first when over capacity", () => {
		const state = new WorkmapState();
		state.update([tree("old", 1), tree("mid", 1)], [], 1_000);
		state.update([tree("new", 1)], [], 2_000);
		expect(state.update([tree("fill", 3)], [], 3_000).evicted).toBeUndefined();

		const result = state.update([tree("extra", 0)], [], 4_000);
		expect(result.evicted).toEqual([{ id: "old", title: "Tree old" }]);
		expect(state.list().map((node) => node.id)).toEqual(["mid", "new", "fill", "extra"]);
	});

	it("refreshes tree age on re-assertion and shields live signals from tier-one eviction", () => {
		const state = new WorkmapState();
		state.update([tree("plain", 1)], [], 1_000);
		state.update(
			[{ id: "open", type: "decision", title: "Where does refresh live?", status: "considering" }],
			[],
			1_000,
		);
		// Re-asserting `plain` refreshes its age above `open`'s, even though the
		// content is unchanged and the update is a no-op otherwise.
		state.update([tree("plain", 1)], [], 2_000);
		state.update(
			Array.from({ length: MAX_WORKMAP_NODES - 3 }, (_, index) => tree(`fill${index}`, 0)),
			[],
			3_000,
		);

		const result = state.update([tree("extra", 0)], [], 4_000);
		expect(result.evicted).toEqual([{ id: "plain", title: "Tree plain" }]);
		expect(state.list().map((node) => node.id)).toContain("open");
	});

	it("refreshes age on byte-identical re-assertion, not just on content changes", () => {
		const state = new WorkmapState();
		state.update([tree("a", 0), tree("b", 0)], [], 1_000);
		// Identical content: the update is a no-op visually, but `a`'s age refreshes.
		state.update([tree("a", 0)], [], 2_000);
		state.update(
			Array.from({ length: 7 }, (_, index) => tree(`f${index}`, 0)),
			[],
			3_000,
		);
		expect(state.update([tree("extra", 0)], [], 4_000).evicted).toBeUndefined();

		const result = state.update([tree("extra2", 0)], [], 5_000);
		expect(result.evicted).toEqual([{ id: "b", title: "Tree b" }]);
		expect(state.list().map((node) => node.id)).toContain("a");
	});

	it("falls back to evicting live-signal trees when nothing else remains", () => {
		const state = new WorkmapState();
		state.update(
			Array.from({ length: MAX_WORKMAP_NODES - 1 }, (_, index) => ({
				id: `open${index}`,
				type: "decision",
				title: `Open ${index}`,
				status: "considering",
			})),
			[],
			1_000,
		);
		state.update([{ id: "drift_root", type: "drift", title: "Off course", status: "detected" }], [], 2_000);

		const result = state.update([tree("extra", 0)], [], 3_000);
		expect(result.evicted).toEqual([{ id: "open0", title: "Open 0" }]);
		expect(state.list()).toHaveLength(MAX_WORKMAP_NODES);
	});

	it("never evicts trees upserted in the same call", () => {
		const state = new WorkmapState();
		state.update(
			[tree("old", 0), ...Array.from({ length: MAX_WORKMAP_NODES - 2 }, (_, index) => tree(`fill${index}`, 0))],
			[],
			1_000,
		);
		// Two fresh trees arrive at full capacity: the oldest prior tree must go,
		// never the fresh siblings.
		const result = state.update([tree("fresh_a", 0), tree("fresh_b", 0)], [], 2_000);
		expect(result.evicted).toEqual([{ id: "old", title: "Tree old" }]);
		expect(state.list().map((node) => node.id)).toContain("fresh_a");
		expect(state.list()).toHaveLength(MAX_WORKMAP_NODES);
	});

	it("rejects an update that exceeds capacity even with every prior tree evicted", () => {
		const state = new WorkmapState();
		state.update([goal], [], 1_000);

		const result = state.update([tree("huge", MAX_WORKMAP_NODES)], [], 2_000);
		expect(result.changed).toBe(false);
		expect(result.error).toContain("capacity");
		expect(state.list()).toEqual([goal]);
	});

	it("restores the latest v3 snapshot from the whole session rather than the active branch", () => {
		const oldSnapshot: WorkmapSnapshot = { version: 3, nodes: [{ ...goal, updatedAt: 1 }] };
		const latestSnapshot: WorkmapSnapshot = {
			version: 3,
			nodes: [
				{ id: "new_direction", type: "drift", title: "Implementation follows an obsolete decision", updatedAt: 2 },
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

		expect(state.list()).toEqual(latestSnapshot.nodes.map(({ updatedAt: _ignored, ...root }) => root));
	});

	it("evicts oversized snapshots down to capacity on restore", () => {
		const nodes = Array.from({ length: MAX_WORKMAP_NODES + 2 }, (_, index) => ({
			id: `root${index}`,
			type: "task" as const,
			title: `Tree ${index}`,
			updatedAt: 1_000 + index,
		}));
		const entries = [
			{
				type: "custom",
				id: "entry-0",
				parentId: null,
				timestamp: new Date(0).toISOString(),
				customType: WORKMAP_ENTRY_TYPE,
				data: { version: 3, nodes } as WorkmapSnapshot,
			} as SessionEntry,
		];
		const state = new WorkmapState();

		state.restore(sessionWith(entries));

		const ids = state.list().map((node) => node.id);
		expect(ids).toHaveLength(MAX_WORKMAP_NODES);
		expect(ids).not.toContain("root0");
		expect(ids).not.toContain("root1");
	});

	it("skips legacy snapshots: workmap state is ephemeral by design", () => {
		const legacySnapshot = {
			version: 2,
			nodes: [goal, { id: "child", type: "task", title: "Nested child", note: "stale field" }],
		};
		const entries = [
			{
				type: "custom",
				id: "entry-0",
				parentId: null,
				timestamp: new Date(0).toISOString(),
				customType: WORKMAP_ENTRY_TYPE,
				data: legacySnapshot,
			} as SessionEntry,
		];
		const state = new WorkmapState();

		state.restore(sessionWith(entries));

		expect(state.list()).toEqual([]);
	});
});
