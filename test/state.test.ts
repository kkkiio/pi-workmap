import { SessionManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { persistSnapshot, WORKMAP_ENTRY_TYPE, WORKMAP_SNAPSHOT_VERSION } from "../src/session-entry.js";
import { WorkmapState } from "../src/state.js";
import type { WorkmapView } from "../src/types.js";

const goal = { title: "Stop random logouts", label: "long-term" };
const base: WorkmapView = { goal, nodes: [{ type: "task", title: "Trace concurrent refreshes", label: "active" }] };

describe("WorkmapState", () => {
	it("replaces the complete state atomically and owns its copies", () => {
		const state = new WorkmapState();
		const input = structuredClone(base);
		expect(state.set(input)).toEqual({ changed: true });
		if (input.goal) input.goal.title = "Changed outside the state";
		state.view().nodes[0].title = "Changed through a view";
		expect(state.view()).toEqual(base);
		expect(state.set(structuredClone(base))).toEqual({ changed: false });
		expect(state.set({ nodes: [] })).toEqual({ changed: true });
		state.restore(SessionManager.inMemory());
		expect(state.view()).toEqual({ nodes: [] });
	});

	it.each([
		{ nodes: [{ type: "task", title: "" }] },
		{ nodes: [{ type: "task", title: "Parent", children: [{ type: "task", title: " \n " }] }] },
		{ goal: { title: " \t " }, nodes: [] },
		{ goal: { title: "x".repeat(121) }, nodes: [] },
		{ goal: { title: "Goal", label: "x".repeat(25) }, nodes: [] },
		{ nodes: [{ type: "unknown", title: "Invalid type" }] },
		{ nodes: [{ type: "option", title: "Orphan option" }] },
		{ nodes: [{ type: "task", title: "Parent", children: [{ type: "option", title: "Misfiled option" }] }] },
		{ nodes: [{ type: "task", title: "Root", children: [{ type: "task", title: "Child", children: [] }] }] },
	])("rejects invalid declarations without changing accepted state: %j", (invalid) => {
		const state = new WorkmapState();
		state.set(base);
		expect(state.set(invalid as WorkmapView)).toMatchObject({ changed: false, error: expect.any(String) });
		expect(state.view()).toEqual(base);
	});

	it("normalizes every node before persistence and restoration", () => {
		const state = new WorkmapState();
		const session = SessionManager.inMemory();
		state.set({
			goal: { title: " Stop\tlogouts ", label: " " },
			nodes: [
				{
					type: "task",
					title: " Parent ",
					children: [{ type: "understanding", title: " Shared\ncache ", label: " ruled out " }],
				},
			],
		});
		persistSnapshot(
			{
				appendEntry: (type, data) => {
					session.appendCustomEntry(type, data);
				},
			},
			state.view(),
		);
		const restored = new WorkmapState();
		restored.restore(session);
		expect(restored.view()).toEqual({
			goal: { title: "Stop logouts" },
			nodes: [
				{
					type: "task",
					title: "Parent",
					children: [{ type: "understanding", title: "Shared cache", label: "ruled out" }],
				},
			],
		});
	});

	it.each([0, 5, 9])("round-trips a ten-node map with %i children", (children) => {
		const state = new WorkmapState();
		const nodes: WorkmapView["nodes"] = Array.from({ length: 10 - children }, (_, i) => ({
			type: "task",
			title: `Root ${i}`,
		}));
		nodes[0].children = Array.from({ length: children }, (_, i) => ({ type: "task", title: `Child ${i}` }));
		expect(state.set({ nodes })).toEqual({ changed: true });
		const accepted = state.view();
		expect(state.set({ ...accepted, goal })).toMatchObject({ changed: false, error: expect.any(String) });
		expect(state.view()).toEqual(accepted);
		const session = SessionManager.inMemory();
		persistSnapshot(
			{
				appendEntry: (type, data) => {
					session.appendCustomEntry(type, data);
				},
			},
			accepted,
		);
		const restored = new WorkmapState();
		restored.restore(session);
		expect(restored.view()).toEqual(accepted);
	});

	it("restores the latest session-global snapshot across tree navigation", () => {
		const session = SessionManager.inMemory();
		const original = session.appendCustomEntry(WORKMAP_ENTRY_TYPE, { version: WORKMAP_SNAPSHOT_VERSION, ...base });
		const latest = {
			...base,
			nodes: [{ type: "drift", title: "Client-only fix assumes a single worker", label: "detected" }],
		};
		session.appendCustomEntry(WORKMAP_ENTRY_TYPE, { version: WORKMAP_SNAPSHOT_VERSION, ...latest });
		session.branch(original);
		const restored = new WorkmapState();
		restored.restore(session);
		expect(restored.view()).toEqual(latest);
	});

	it.each([
		{ goal: { title: 123 }, nodes: [] },
		{ goal: { title: "" }, nodes: [] },
		{ goal, nodes: Array.from({ length: 10 }, () => ({ type: "task", title: "Task" })) },
		{ nodes: [{ type: "task", title: "Parent", children: {} }] },
		{ nodes: [{ type: "task", title: "Parent", children: [null] }] },
		{ nodes: [null] },
	])("falls back from a malformed latest snapshot: %j", (invalid) => {
		const session = SessionManager.inMemory();
		session.appendCustomEntry(WORKMAP_ENTRY_TYPE, { version: WORKMAP_SNAPSHOT_VERSION, ...base });
		session.appendCustomEntry(WORKMAP_ENTRY_TYPE, { version: WORKMAP_SNAPSHOT_VERSION, ...invalid });
		const restored = new WorkmapState();
		restored.restore(session);
		expect(restored.view()).toEqual(base);
	});

	it.each([4, 5, 6])("migrates v%i goal and child labels", (version) => {
		const session = SessionManager.inMemory();
		session.appendCustomEntry(WORKMAP_ENTRY_TYPE, {
			version,
			nodes: [
				{ type: version === 4 ? "heading" : "goal", title: goal.title, status: goal.label },
				{
					type: "decision",
					title: "Where should serialization live?",
					status: "considering",
					children: [{ type: "option", title: "Server", status: "preferred" }],
				},
			],
		});
		const restored = new WorkmapState();
		restored.restore(session);
		expect(restored.view()).toEqual({
			goal,
			nodes: [
				{
					type: "decision",
					title: "Where should serialization live?",
					label: "considering",
					children: [{ type: "option", title: "Server", label: "preferred" }],
				},
			],
		});
	});

	it.each([4, 5, 6])("falls back when v%i migration encounters malformed children", (version) => {
		for (const children of [{}, [null], ["bad"]]) {
			const session = SessionManager.inMemory();
			session.appendCustomEntry(WORKMAP_ENTRY_TYPE, { version: WORKMAP_SNAPSHOT_VERSION, ...base });
			session.appendCustomEntry(WORKMAP_ENTRY_TYPE, { version, nodes: [{ type: "task", title: "Parent", children }] });
			const restored = new WorkmapState();
			restored.restore(session);
			expect(restored.view()).toEqual(base);
		}
	});
});
