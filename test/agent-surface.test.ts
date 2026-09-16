import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import workmapExtension from "../src/index.js";

/** Everything the model is shown about one registered tool. */
interface AgentApiTool {
	name: string;
	label: string;
	description: string;
	promptSnippet: string | null;
	promptGuidelines: string[];
	parameters: unknown;
}

/**
 * Collect the context-facing surface this extension registers: tool schemas,
 * descriptions, snippets and guidelines. These strings are product surface, so
 * the snapshot keeps wording changes visible in review.
 */
function collectAgentApi(): AgentApiTool[] {
	const tools = new Map<string, ToolDefinition>();
	const pi = {
		on: () => {},
		registerTool: (tool: ToolDefinition) => {
			tools.set(tool.name, tool);
		},
	} as unknown as ExtensionAPI;
	workmapExtension(pi);
	return [...tools.values()].map((tool) => ({
		name: tool.name,
		label: tool.label,
		description: tool.description,
		promptSnippet: tool.promptSnippet ?? null,
		promptGuidelines: tool.promptGuidelines ?? [],
		parameters: tool.parameters,
	}));
}

describe("agent-facing tool surface", () => {
	it("keeps schemas, descriptions and guidelines stable (snapshot)", () => {
		expect(collectAgentApi()).toMatchSnapshot();
	});

	it("registers the workmap tools in write order", () => {
		expect(collectAgentApi().map((tool) => tool.name)).toEqual(["restate", "set_goal", "add_drift"]);
	});
});
