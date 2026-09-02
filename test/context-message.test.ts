import { describe, expect, it } from "vitest";
import { renderStateMessage, renderTreeLines } from "../src/context-message.js";
import type { WorkmapRoot } from "../src/types.js";

const nodes: WorkmapRoot[] = [
	{ type: "heading", title: "Keep users signed in reliably", status: "current" },
	{
		type: "decision",
		title: "Refresh serialization ownership",
		status: "considering",
		children: [
			{ type: "option", title: "Serialize in the client" },
			{ type: "option", title: "Make refresh idempotent on the server", status: "preferred" },
		],
	},
	{ type: "task", title: "A standalone task renders as its own tree" },
];

describe("renderStateMessage", () => {
	const output = renderStateMessage(nodes, { promptsSinceRewrite: 0 });

	it("renders a scannable tree-ordered listing with statuses", () => {
		expect(output).toContain("heading [current]: Keep users signed in reliably");
		expect(output).toContain("decision [considering]: Refresh serialization ownership");
		expect(output).toContain("  option: Serialize in the client");
		expect(output).toContain("  option [preferred]: Make refresh idempotent on the server");
	});

	it("indents children under their parent", () => {
		const decision = output.indexOf("decision [considering]");
		const option = output.indexOf("  option: Serialize in the client");
		expect(option).toBeGreaterThan(decision);
	});

	it("frames the message as a live state anchor with the two writing surfaces", () => {
		expect(output).toContain("state anchor, not conversation to react to");
		expect(output).toContain("Re-declare this map with the workmap tool on every user prompt");
		expect(output).toContain("add_drift the moment you change course mid-task");
		expect(output.startsWith("<workmap-state>")).toBe(true);
		expect(output.trimEnd().endsWith("</workmap-state>")).toBe(true);
	});

	it("keeps the routine footer while the map is fresh", () => {
		expect(renderStateMessage(nodes, { promptsSinceRewrite: 1 })).toContain(
			"Re-declare this map with the workmap tool on every user prompt",
		);
		expect(renderStateMessage(nodes, { promptsSinceRewrite: 1 })).not.toContain("stale");
	});

	it("escalates once the map is stale", () => {
		expect(renderStateMessage(nodes, { promptsSinceRewrite: 2 })).toContain(
			"The workmap is 2 user prompts stale — re-declare it with the workmap tool before acting.",
		);
		expect(renderStateMessage(nodes, { promptsSinceRewrite: 7 })).toContain("7 user prompts stale");
	});
});

describe("renderTreeLines", () => {
	it("leads with heading roots and indents children", () => {
		const lines = renderTreeLines(nodes);
		expect(lines[0]).toContain("heading");
		expect(lines.find((line) => line.includes("Serialize in the client"))?.startsWith("  option:")).toBe(true);
	});
});
