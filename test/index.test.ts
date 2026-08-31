import {
	type ExtensionAPI,
	type ExtensionContext,
	SessionManager,
	type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import workmapExtension from "../src/index.js";
import { WORKMAP_ENTRY_TYPE } from "../src/state.js";
import type { WorkmapSnapshot } from "../src/types.js";

describe("workmap extension lifecycle", () => {
	it("inherits the session-global workmap when a fork omits the latest branch", async () => {
		const snapshot: WorkmapSnapshot = {
			version: 1,
			nodes: [{ id: "current_goal", type: "heading", title: "Keep the latest session direction" }],
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
		expect(appendEntry).toHaveBeenCalledWith(WORKMAP_ENTRY_TYPE, snapshot);
	});

	describe("context injection", () => {
		type Handler = (event: never, context: ExtensionContext) => Promise<unknown> | unknown;

		function setup() {
			const handlers = new Map<string, Handler>();
			let tool: {
				execute: (
					toolCallId: string,
					params: { action: string; nodes?: unknown[] },
					signal: undefined,
					onUpdate: undefined,
					ctx: undefined,
				) => Promise<unknown>;
			};
			const pi = {
				on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
				appendEntry: vi.fn(),
				registerTool: vi.fn((definition: unknown) => {
					tool = definition as typeof tool;
				}),
			} as unknown as ExtensionAPI;
			workmapExtension(pi);
			const sessionManager = SessionManager.inMemory();
			const context = {
				sessionManager,
				ui: { setWidget: vi.fn() },
			} as unknown as ExtensionContext;
			return { handlers, context, getTool: () => tool };
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

		it("re-injects every run with the agent-turn staleness counter", async () => {
			const { handlers, context, getTool } = setup();
			await handlers.get("session_start")?.({ type: "session_start", reason: "new" } as never, context);
			const turnEnd = handlers.get("turn_end");
			const update = (nodes: unknown[]) =>
				getTool().execute("call", { action: "update", nodes }, undefined, undefined, undefined);

			await update([{ id: "heading", type: "heading", title: "Ship the staleness counter" }]);
			const fresh = await beforeAgentStart(handlers, context);
			expect(fresh?.message?.content).toContain("Last workmap update: 0 turns ago.");

			await turnEnd?.({} as never, context);
			await turnEnd?.({} as never, context);
			await turnEnd?.({} as never, context);
			const stale = await beforeAgentStart(handlers, context);
			expect(stale?.message?.content).toContain("Last workmap update: 3 turns ago.");

			// A no-change re-assertion re-anchors the map.
			await update([{ id: "heading", type: "heading", title: "Ship the staleness counter" }]);
			const reasserted = await beforeAgentStart(handlers, context);
			expect(reasserted?.message?.content).toContain("Last workmap update: 0 turns ago.");
		});

		it("keeps the counter running across tree navigation", async () => {
			const { handlers, context, getTool } = setup();
			await handlers.get("session_start")?.({ type: "session_start", reason: "new" } as never, context);
			await getTool().execute(
				"call",
				{ action: "update", nodes: [{ id: "heading", type: "heading", title: "Survive branch switches" }] },
				undefined,
				undefined,
				undefined,
			);
			await handlers.get("turn_end")?.({} as never, context);
			await handlers.get("turn_end")?.({} as never, context);
			await handlers.get("session_tree")?.({ type: "session_tree" } as never, context);
			const result = await beforeAgentStart(handlers, context);
			expect(result?.message?.content).toContain("Last workmap update: 2 turns ago.");
		});
	});
});
