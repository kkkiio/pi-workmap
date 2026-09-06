import { describe, expect, it } from "vitest";
import { renderStateMessage } from "../src/context-message.js";
import type { WorkmapView } from "../src/types.js";

const view: WorkmapView = {
	goal: { title: "Stop random logouts", label: "long-term" },
	nodes: [
		{
			type: "decision",
			title: "Where should serialization live?",
			label: "considering",
			children: [{ type: "option", title: "Server", label: "preferred" }],
		},
		{ type: "drift", title: "Client-only fix assumes one worker", label: "detected" },
	],
};

describe("state context", () => {
	it("carries the goal followed by drift and the supporting tree", () => {
		expect(renderStateMessage(view)).toBe(
			[
				"<workmap-state>",
				"goal [long-term]: Stop random logouts",
				"drift [detected]: Client-only fix assumes one worker",
				"decision [considering]: Where should serialization live?",
				"  option [preferred]: Server",
				"</workmap-state>",
			].join("\n"),
		);
	});
	it("renders a drift while the goal is still being formed", () => {
		expect(renderStateMessage({ nodes: [view.nodes[1]] })).toBe(
			["<workmap-state>", "drift [detected]: Client-only fix assumes one worker", "</workmap-state>"].join("\n"),
		);
	});
});
