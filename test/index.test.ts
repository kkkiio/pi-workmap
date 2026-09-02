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
	{ type: "heading", title: "Keep the auth layer trustworthy", status: "long-term" },
	{ type: "heading", title: "Ship the staleness sensor", status: "current" },
];

describe("workmap extension lifecycle", () => {
	it("inherits the session-global workmap when a fork omits the latest branch", async () => {
		const snapshot: WorkmapSnapshot = {
			version: WORKMAP_SNAPSHOT_VERSION,
			nodes: [
				{ type: "heading", title: "Keep the auth layer trustworthy", status: "long-term" },
				{ type: "heading", title: "Keep the latest session direction", status: "current" },
			],
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
			return { handlers, context, getTool: (name: string) => tools.get(name) as never };
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

		it("re-injects every run and escalates when the map goes stale", async () => {
			const { handlers, context, getTool } = setup();
			await handlers.get("session_start")?.({ type: "session_start", reason: "new" } as never, context);
			const set = (nodes: WorkmapRoot[]) =>
				getTool("workmap").execute("call", { set: nodes }, undefined, undefined, undefined);

			await set(baseMap);
			const fresh = await beforeAgentStart(handlers, context);
			expect(fresh?.message?.content).toContain("Re-declare this map with the workmap tool on every user prompt");
			expect(fresh?.message?.content).not.toContain("user prompts stale");

			const stale = await beforeAgentStart(handlers, context);
			expect(stale?.message?.content).toContain("The workmap is 2 user prompts stale");

			const staler = await beforeAgentStart(handlers, context);
			expect(staler?.message?.content).toContain("3 user prompts stale");

			// A re-declaration re-anchors the map.
			await set(baseMap);
			const reasserted = await beforeAgentStart(handlers, context);
			expect(reasserted?.message?.content).not.toContain("user prompts stale");
		});

		it("keeps the counter running across tree navigation", async () => {
			const { handlers, context, getTool } = setup();
			await handlers.get("session_start")?.({ type: "session_start", reason: "new" } as never, context);
			await getTool("workmap").execute("call", { set: baseMap }, undefined, undefined, undefined);
			await beforeAgentStart(handlers, context);
			await beforeAgentStart(handlers, context);
			await handlers.get("session_tree")?.({ type: "session_tree" } as never, context);
			const result = await beforeAgentStart(handlers, context);
			expect(result?.message?.content).toContain("3 user prompts stale");
		});

		it("rejects a set without the double heading and an add_drift on an empty map", async () => {
			const { handlers, context, getTool } = setup();
			await handlers.get("session_start")?.({ type: "session_start", reason: "new" } as never, context);

			const badSet = (await getTool("workmap").execute(
				"call",
				{ set: [{ type: "task", title: "No headings" }] },
				undefined,
				undefined,
				undefined,
			)) as {
				isError: boolean;
				details: { error?: string };
			};
			expect(badSet.isError).toBe(true);
			expect(badSet.details.error).toContain("needs a current heading");

			const drift = (await getTool("add_drift").execute(
				"call",
				{ title: "Off course" },
				undefined,
				undefined,
				undefined,
			)) as {
				isError: boolean;
				details: { error?: string };
			};
			expect(drift.isError).toBe(true);
			expect(drift.details.error).toContain("empty");
		});
	});
});
