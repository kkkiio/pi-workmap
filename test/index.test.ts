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
});
