import { describe, expect, it } from "vitest";
import { orderedRoots, renderStateMessage, renderTreeLines } from "../src/agent_api.js";
import type { WorkmapRoot } from "../src/types.js";

const goal = { title: "Stop random logouts", label: "long-term" };

const nodes: WorkmapRoot[] = [
	{
		type: "decision",
		title: "Refresh serialization ownership",
		label: "considering",
		children: [
			{ type: "option", title: "Serialize in the client" },
			{ type: "option", title: "Make refresh idempotent on the server", label: "preferred" },
		],
	},
	{ type: "task", title: "A standalone task renders as its own tree" },
	{ type: "drift", title: "Implementation follows an obsolete decision", label: "detected" },
];

describe("renderStateMessage", () => {
	const output = renderStateMessage(nodes, goal, { promptsSinceRewrite: 0 });

	it("renders a scannable tree-ordered listing with labels", () => {
		expect(output).toContain("decision [considering]: Refresh serialization ownership");
		expect(output).toContain("  option: Serialize in the client");
		expect(output).toContain("  option [preferred]: Make refresh idempotent on the server");
	});

	it("renders the goal header when present", () => {
		expect(output).toContain("goal [long-term]: Stop random logouts");
		expect(output.indexOf("goal [long-term]")).toBeLessThan(output.indexOf("drift [detected]"));
	});

	it("omits the header line without a goal", () => {
		const bare = renderStateMessage(nodes, undefined, { promptsSinceRewrite: 0 });
		expect(bare).not.toContain("goal [");
	});

	it("indents children under their parent", () => {
		const decision = output.indexOf("decision [considering]");
		const option = output.indexOf("  option: Serialize in the client");
		expect(option).toBeGreaterThan(decision);
	});

	it("frames the message with the two writing surfaces", () => {
		expect(output).toContain("Restate this map on every user prompt");
		expect(output).toContain("add_drift the moment you change course mid-task");
		expect(output.startsWith("<workmap-state>")).toBe(true);
		expect(output.trimEnd().endsWith("</workmap-state>")).toBe(true);
	});

	it("keeps the routine footer while the map is fresh", () => {
		expect(renderStateMessage(nodes, undefined, { promptsSinceRewrite: 1 })).toContain(
			"Restate this map on every user prompt",
		);
		expect(renderStateMessage(nodes, undefined, { promptsSinceRewrite: 1 })).not.toContain("stale");
	});

	it("escalates once the map is stale", () => {
		expect(renderStateMessage(nodes, undefined, { promptsSinceRewrite: 2 })).toContain(
			"The workmap is 2 user prompts stale — restate it before acting.",
		);
		expect(renderStateMessage(nodes, undefined, { promptsSinceRewrite: 7 })).toContain("7 user prompts stale");
	});
});

describe("renderTreeLines", () => {
	it("leads with drift roots and indents children", () => {
		const lines = renderTreeLines(nodes);
		expect(lines[0]).toContain("drift");
		expect(lines.find((line) => line.includes("Serialize in the client"))?.startsWith("  option:")).toBe(true);
	});
});

describe("orderedRoots", () => {
	it("hoists drift above the other roots", () => {
		const ordered = orderedRoots(nodes);
		expect(ordered[0]?.type).toBe("drift");
		expect(ordered.slice(1).some((root) => root.type === "drift")).toBe(false);
	});
});
