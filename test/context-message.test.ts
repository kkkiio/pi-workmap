import { describe, expect, it } from "vitest";
import { renderStateMessage } from "../src/context-message.js";
import type { WorkmapNode } from "../src/types.js";

const nodes: WorkmapNode[] = [
	{ id: "reliable_auth", type: "heading", title: "Keep users signed in reliably", status: "current" },
	{ id: "refresh_race", type: "task", title: "Check whether the refresh race can cross workers", status: "active" },
	{ id: "serialization", type: "decision", title: "Refresh serialization ownership", status: "considering" },
	{ id: "client_serialization", type: "option", title: "Serialize in the client", parentId: "serialization" },
	{
		id: "server_idempotency",
		type: "option",
		title: "Make refresh idempotent on the server",
		status: "preferred",
		parentId: "serialization",
		note: "More robust across workers,\nbut a larger change.",
	},
	{ id: "orphan", type: "task", title: "Node with a missing parent still renders", parentId: "gone" },
];

describe("renderStateMessage", () => {
	const output = renderStateMessage(nodes);

	it("renders a scannable tree-ordered listing with inline ids and statuses", () => {
		expect(output).toContain("heading reliable_auth [current]: Keep users signed in reliably");
		expect(output).toContain("decision serialization [considering]: Refresh serialization ownership");
		expect(output).toContain("  option client_serialization: Serialize in the client");
		expect(output).toContain("  option server_idempotency [preferred]: Make refresh idempotent on the server");
	});

	it("indents children under their parent", () => {
		const decision = output.indexOf("decision serialization");
		const option = output.indexOf("  option client_serialization");
		expect(option).toBeGreaterThan(decision);
	});

	it("keeps notes out of the injected snapshot", () => {
		expect(output).not.toContain("note:");
		expect(output).not.toContain("More robust across workers");
	});

	it("treats nodes with missing parents as roots", () => {
		expect(output).toContain("task orphan: Node with a missing parent still renders");
	});

	it("frames the message as a live state anchor without prohibitive instructions", () => {
		expect(output).toContain("state anchor, not conversation to react to");
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
