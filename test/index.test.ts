import {
	type ExtensionAPI,
	type ExtensionContext,
	SessionManager,
	type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import workmapExtension from "../src/index.js";
import { WORKMAP_ENTRY_TYPE, WORKMAP_SNAPSHOT_VERSION, type WorkmapSnapshot } from "../src/session-entry.js";
import type { WorkmapRoot } from "../src/types.js";

const baseMap: WorkmapRoot[] = [
	{ type: "decision", title: "Use session-global snapshots", label: "chosen" },
	{ type: "understanding", title: "Tree navigation must not roll back the map" },
];

describe("workmap extension lifecycle", () => {
	it("inherits the session-global workmap when a fork omits the latest branch", async () => {
		const snapshot: WorkmapSnapshot = {
			version: WORKMAP_SNAPSHOT_VERSION,
			goal: { title: "Stop random logouts", label: "long-term" },
			nodes: [...baseMap, { type: "task", title: "Keep the latest session direction" }],
		};
		const sourceSession = SessionManager.inMemory();
		sourceSession.appendCustomEntry(WORKMAP_ENTRY_TYPE, snapshot);
		const forkedSession = SessionManager.inMemory();
		const appendEntry = vi.fn();
		let sessionStart: ((event: SessionStartEvent, context: ExtensionContext) => Promise<unknown> | unknown) | undefined;
		const pi = {
			on: vi.fn((event: string, handler: unknown) => {
				if (event === "session_start") sessionStart = handler as typeof sessionStart;
			}),
			appendEntry,
			registerTool: vi.fn(),
		} as unknown as ExtensionAPI;
		workmapExtension(pi);
		const open = vi.spyOn(SessionManager, "open").mockReturnValue(sourceSession);
		const context = {
			sessionManager: forkedSession,
			ui: { setWidget: vi.fn() },
		} as unknown as ExtensionContext;

		await sessionStart?.(
			{ type: "session_start", reason: "fork", previousSessionFile: "/sessions/source.jsonl" },
			context,
		);

		expect(open).toHaveBeenCalledWith("/sessions/source.jsonl");
		expect(appendEntry).toHaveBeenCalledWith(WORKMAP_ENTRY_TYPE, {
			version: WORKMAP_SNAPSHOT_VERSION,
			goal: snapshot.goal,
			nodes: snapshot.nodes,
		});
	});

	describe("context injection", () => {
		type Handler = (event: never, context: ExtensionContext) => Promise<unknown> | unknown;

		function setup() {
			const handlers = new Map<string, Handler>();
			const tools = new Map<
				string,
				{
					execute: (
						toolCallId: string,
						params: unknown,
						signal: undefined,
						onUpdate: undefined,
						ctx: undefined,
					) => Promise<unknown>;
				}
			>();
			const sessionManager = SessionManager.inMemory();
			const pi = {
				on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
				appendEntry: vi.fn((customType: string, data: unknown) => sessionManager.appendCustomEntry(customType, data)),
				registerTool: vi.fn((definition: { name: string }) => {
					tools.set(definition.name, definition as never);
				}),
			} as unknown as ExtensionAPI;
			workmapExtension(pi);
			const context = {
				sessionManager,
				ui: { setWidget: vi.fn() },
			} as unknown as ExtensionContext;
			return {
				handlers,
				context,
				getTool: (name: string) => {
					const tool = tools.get(name);
					if (!tool) throw new Error(`tool ${name} not registered`);
					return tool;
				},
			};
		}

		const beforeAgentStart = (handlers: Map<string, Handler>, context: ExtensionContext) =>
			handlers.get("before_agent_start")?.({ type: "before_agent_start" } as never, context) as Promise<
				{ message?: { content?: string } } | undefined
			>;

		it("stays silent while the map is empty", async () => {
			const { handlers, context } = setup();
			await handlers.get("session_start")?.({ type: "session_start", reason: "new" } as never, context);
			const result = await beforeAgentStart(handlers, context);
			expect(result?.message).toBeUndefined();
		});

		it("injects the goal header once set_goal distills it", async () => {
			const { handlers, context, getTool } = setup();
			await handlers.get("session_start")?.({ type: "session_start", reason: "new" } as never, context);

			const fresh = await beforeAgentStart(handlers, context);
			expect(fresh?.message).toBeUndefined();

			await getTool("set_goal").execute(
				"call",
				{ title: "Stop random logouts", label: "long-term" },
				undefined,
				undefined,
				undefined,
			);
			const withGoal = await beforeAgentStart(handlers, context);
			expect(withGoal?.message?.content).toContain("goal [long-term]: Stop random logouts");
		});

		it("re-injects every run and escalates when the map goes stale", async () => {
			const { handlers, context, getTool } = setup();
			await handlers.get("session_start")?.({ type: "session_start", reason: "new" } as never, context);
			const set = (nodes: WorkmapRoot[]) =>
				getTool("restate").execute("call", { set: nodes }, undefined, undefined, undefined);

			await set(baseMap);
			const fresh = await beforeAgentStart(handlers, context);
			expect(fresh?.message?.content).toContain("Restate this map on every user prompt");
			expect(fresh?.message?.content).not.toContain("user prompts stale");

			const stale = await beforeAgentStart(handlers, context);
			expect(stale?.message?.content).toContain("The workmap is 2 user prompts stale");

			const staler = await beforeAgentStart(handlers, context);
			expect(staler?.message?.content).toContain("3 user prompts stale");

			// add_drift is an append, not a rewrite: it must not re-anchor the map.
			await getTool("add_drift").execute("call", { title: "Off course" }, undefined, undefined, undefined);
			const afterDrift = await beforeAgentStart(handlers, context);
			expect(afterDrift?.message?.content).toContain("4 user prompts stale");

			// set_goal is also not a rewrite: the counter keeps counting.
			await getTool("set_goal").execute("call", { title: "Stop random logouts" }, undefined, undefined, undefined);
			const afterGoal = await beforeAgentStart(handlers, context);
			expect(afterGoal?.message?.content).toContain("5 user prompts stale");

			// Only a full re-declaration re-anchors the map.
			await set(baseMap);
			const reasserted = await beforeAgentStart(handlers, context);
			expect(reasserted?.message?.content).not.toContain("user prompts stale");
		});

		it("keeps the counter running across tree navigation", async () => {
			const { handlers, context, getTool } = setup();
			await handlers.get("session_start")?.({ type: "session_start", reason: "new" } as never, context);
			await getTool("restate").execute("call", { set: baseMap }, undefined, undefined, undefined);
			await beforeAgentStart(handlers, context);
			await beforeAgentStart(handlers, context);
			await handlers.get("session_tree")?.({ type: "session_tree" } as never, context);
			const result = await beforeAgentStart(handlers, context);
			expect(result?.message?.content).toContain("3 user prompts stale");
		});

		it("lets a drift open an empty map and carries the goal across rewrites", async () => {
			const { handlers, context, getTool } = setup();
			await handlers.get("session_start")?.({ type: "session_start", reason: "new" } as never, context);

			const drift = (await getTool("add_drift").execute(
				"call",
				{ title: "Off course" },
				undefined,
				undefined,
				undefined,
			)) as { isError: boolean; details: { error?: string } };
			expect(drift.isError).toBe(false);
			expect(drift.details.error).toBeUndefined();

			await getTool("set_goal").execute("call", { title: "Stop random logouts" }, undefined, undefined, undefined);
			await getTool("restate").execute("call", { set: [] }, undefined, undefined, undefined);
			const injected = await beforeAgentStart(handlers, context);
			expect(injected?.message?.content).toContain("goal: Stop random logouts");
			expect(injected?.message?.content).not.toContain("drift [detected]");
		});

		it("does not re-anchor the map on a rejected set", async () => {
			const { handlers, context, getTool } = setup();
			await handlers.get("session_start")?.({ type: "session_start", reason: "new" } as never, context);
			await getTool("restate").execute("call", { set: baseMap }, undefined, undefined, undefined);
			await beforeAgentStart(handlers, context);

			// A rejected set changed nothing: it must not reset the stale counter.
			await getTool("restate").execute(
				"call",
				{
					set: [
						{
							type: "task",
							title: "Too deep",
							children: [{ type: "task", title: "Child", children: [{ type: "task", title: "Grandchild" }] }],
						},
					],
				},
				undefined,
				undefined,
				undefined,
			);
			await beforeAgentStart(handlers, context);
			const result = await beforeAgentStart(handlers, context);
			expect(result?.message?.content).toContain("3 user prompts stale");
		});
	});
});
