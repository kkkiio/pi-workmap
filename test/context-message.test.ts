import { describe, expect, it } from "vitest";
import { renderStateMessage } from "../src/context-message.js";
import type { WorkmapNode } from "../src/types.js";

const nodes: WorkmapNode[] = [
	{ id: "reliable_auth", type: "goal", title: "Keep users signed in reliably", status: "current" },
	{ id: "refresh_race", type: "unknown", title: "Can the refresh race cross workers?", status: "investigating" },
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
		expect(output).toContain("goal reliable_auth [current]: Keep users signed in reliably");
		expect(output).toContain("decision serialization [considering]: Refresh serialization ownership");
		expect(output).toContain("  option client_serialization: Serialize in the client");
		expect(output).toContain("  option server_idempotency [preferred]: Make refresh idempotent on the server");
	});

	it("indents children under their parent and collapses note whitespace", () => {
		const decision = output.indexOf("decision serialization");
		const option = output.indexOf("  option client_serialization");
		expect(option).toBeGreaterThan(decision);
		expect(output).toContain("  note: More robust across workers, but a larger change.");
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
});
