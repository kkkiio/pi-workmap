import {
	type ExtensionAPI,
	type ExtensionContext,
	SessionManager,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import workmapExtension from "../src/index.js";
import { WORKMAP_ENTRY_TYPE, WORKMAP_SNAPSHOT_VERSION } from "../src/session-entry.js";
import type { WorkmapToolDetails } from "../src/types.js";

type Handler = (event: unknown, context: ExtensionContext) => Promise<unknown> | unknown;

function setup(sessionManager = SessionManager.inMemory()) {
	const handlers = new Map<string, Handler>();
	const tools = new Map<string, ToolDefinition>();
	const appendEntry = vi.fn((customType: string, data: unknown) => sessionManager.appendCustomEntry(customType, data));
	const pi = {
		on: (event: string, handler: Handler) => handlers.set(event, handler),
		appendEntry,
		registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool),
	} as unknown as ExtensionAPI;
	workmapExtension(pi);
	const context = { sessionManager, ui: { setWidget: vi.fn() } } as unknown as ExtensionContext;
	return {
		tools,
		appendEntry,
		sessionManager,
		event: async (name: string, event: unknown = { type: name }) => handlers.get(name)?.(event, context),
		call: async (name: string, params: unknown) => {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Missing tool: ${name}`);
			return tool.execute("call", params, undefined, undefined, context);
		},
	};
}

const goal = { title: "Stop random logouts", label: "long-term" };
const task = { type: "task", title: "Trace concurrent refreshes", label: "active" };

describe("workmap tools and lifecycle", () => {
	it("keeps the goal across signal rewrites and restores every accepted tool result", async () => {
		const app = setup();
		await app.event("session_start", { reason: "new" });
		await app.call("set_goal", goal);
		for (const [name, params] of [
			["restate", { set: [task] }],
			["add_drift", { title: "The client-only fix assumes a single worker" }],
			["restate", { set: [] }],
		] as const) {
			const result = await app.call(name, params);
			const details = result.details as WorkmapToolDetails;
			expect(details.goal).toEqual(goal);
			const resumed = setup(app.sessionManager);
			await resumed.event("session_start", { reason: "resume" });
			const same = await resumed.call("set_goal", goal);
			expect(same.details).toMatchObject({ goal, nodes: details.nodes, changed: false });
		}
	});

	it("persists an appended drift after eight roots and exposes it after tree navigation", async () => {
		const app = setup();
		await app.event("session_start", { reason: "new" });
		await app.call("set_goal", goal);
		await app.call("restate", { set: Array.from({ length: 8 }, (_, i) => ({ ...task, title: `Task ${i}` })) });
		const result = await app.call("add_drift", { title: "Off course" });
		expect(result.content).toEqual([{ type: "text", text: "Updated workmap · 10 signals" }]);
		const details = result.details as WorkmapToolDetails;
		expect(details.nodes).toHaveLength(9);
		await app.event("session_tree");
		expect(await app.event("before_agent_start")).toMatchObject({
			message: { content: expect.stringContaining("drift [detected]: Off course") },
		});
	});

	it("rejects every overflowing write without persisting or losing the accepted map", async () => {
		const app = setup();
		await app.event("session_start", { reason: "new" });
		const full = Array.from({ length: 10 }, (_, i) => ({ ...task, title: `Task ${i}` }));
		await app.call("restate", { set: full });
		const writes = app.appendEntry.mock.calls.length;
		for (const [name, params] of [
			["set_goal", goal],
			["add_drift", { title: "Off course" }],
			["restate", { set: [...full, task] }],
		] as const) {
			const result = await app.call(name, params);
			expect(result).toMatchObject({ isError: true, details: { changed: false, nodes: full } });
			expect(app.appendEntry).toHaveBeenCalledTimes(writes);
		}
	});

	it("shows a goal-only map in context and counts it in the collapsed tool result", async () => {
		const app = setup();
		await app.event("session_start", { reason: "new" });
		expect(await app.event("before_agent_start")).toEqual({});
		const result = await app.call("set_goal", goal);
		expect(result.content).toEqual([{ type: "text", text: "Updated workmap · 1 signal" }]);
		expect(await app.event("before_agent_start")).toMatchObject({
			message: {
				content: "<workmap-state>\ngoal [long-term]: Stop random logouts\n</workmap-state>",
			},
		});
		await app.event("session_start", { reason: "new" });
		expect(await app.event("before_agent_start")).toEqual({});
	});

	it("lets a drift open the map and rejects an empty normalized child title", async () => {
		const app = setup();
		await app.event("session_start", { reason: "new" });
		const drift = await app.call("add_drift", { title: "Off course" });
		expect(drift).toMatchObject({
			isError: false,
			details: { nodes: [{ type: "drift", title: "Off course", label: "detected" }] },
		});
		const invalid = await app.call("restate", { set: [{ ...task, children: [{ ...task, title: " \n " }] }] });
		expect(invalid).toMatchObject({
			isError: true,
			details: { changed: false, nodes: (drift.details as WorkmapToolDetails).nodes },
		});
	});

	it("inherits the source session's latest map on fork and evolves independently", async () => {
		const source = SessionManager.inMemory();
		source.appendCustomEntry(WORKMAP_ENTRY_TYPE, { version: WORKMAP_SNAPSHOT_VERSION, goal, nodes: [task] });
		const open = vi.spyOn(SessionManager, "open").mockReturnValue(source);
		try {
			const app = setup();
			await app.event("session_start", { reason: "fork", previousSessionFile: "/sessions/source.jsonl" });
			expect(app.appendEntry).toHaveBeenCalledWith(WORKMAP_ENTRY_TYPE, {
				version: WORKMAP_SNAPSHOT_VERSION,
				goal,
				nodes: [task],
			});
			await app.call("set_goal", { title: "Investigate the server alternative" });
			const parent = setup(source);
			await parent.event("session_start", { reason: "resume" });
			expect(await parent.event("before_agent_start")).toMatchObject({
				message: { content: expect.stringContaining(goal.title) },
			});
		} finally {
			open.mockRestore();
		}
	});
});
