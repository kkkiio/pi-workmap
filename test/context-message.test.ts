import { describe, expect, it } from "vitest";
import { renderStateMessage, renderTreeLines } from "../src/context-message.js";
import type { WorkmapRoot } from "../src/types.js";

const nodes: WorkmapRoot[] = [
	{ id: "reliable_auth", type: "heading", title: "Keep users signed in reliably", status: "current" },
	{
		id: "refresh_race",
		type: "task",
		title: "Check whether the refresh race can cross workers",
		status: "active",
	},
	{
		id: "serialization",
		type: "decision",
		title: "Refresh serialization ownership",
		status: "considering",
		children: [
			{ type: "option", title: "Serialize in the client" },
			{
				type: "option",
				title: "Make refresh idempotent on the server",
				status: "preferred",
				note: "More robust across workers,\nbut a larger change.",
			},
		],
	},
	{ id: "orphan", type: "task", title: "A standalone task renders as its own tree" },
];

describe("renderStateMessage", () => {
	const output = renderStateMessage(nodes);

	it("renders a scannable tree-ordered listing with root ids and statuses", () => {
		expect(output).toContain("heading reliable_auth [current]: Keep users signed in reliably");
		expect(output).toContain("decision serialization [considering]: Refresh serialization ownership");
		expect(output).toContain("  option: Serialize in the client");
		expect(output).toContain("  option [preferred]: Make refresh idempotent on the server");
	});

	it("indents children under their parent", () => {
		const decision = output.indexOf("decision serialization");
		const option = output.indexOf("  option: Serialize in the client");
		expect(option).toBeGreaterThan(decision);
	});

	it("keeps notes out of the injected snapshot", () => {
		expect(output).not.toContain("note:");
		expect(output).not.toContain("More robust across workers");
	});

	it("frames the message as a live state anchor with loop-timing guidance", () => {
		expect(output).toContain("state anchor, not conversation to react to");
		expect(output).toContain("heading before investigating");
		expect(output).not.toContain("Do not mention");
		expect(output.startsWith("<workmap-state>")).toBe(true);
		expect(output.trimEnd().endsWith("</workmap-state>")).toBe(true);
	});

	it("omits the staleness line when no meta is given", () => {
		expect(output).not.toContain("Last workmap update");
	});

	it("renders the staleness counter in agent turns", () => {
		expect(renderStateMessage(nodes, { turnsSinceUpdate: 7 })).toContain("Last workmap update: 7 turns ago.");
		expect(renderStateMessage(nodes, { turnsSinceUpdate: 1 })).toContain("Last workmap update: 1 turn ago.");
		expect(renderStateMessage(nodes, { turnsSinceUpdate: 0 })).toContain("Last workmap update: 0 turns ago.");
	});
});

describe("renderTreeLines", () => {
	it("leads with heading roots and leaves children id-free", () => {
		const lines = renderTreeLines(nodes);
		expect(lines[0]).toContain("heading reliable_auth");
		const child = lines.find((line) => line.includes("Serialize in the client"));
		expect(child?.startsWith("  option:")).toBe(true);
	});
});
