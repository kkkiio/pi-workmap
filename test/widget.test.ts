import type { ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import type { WorkmapNode } from "../src/types.js";
import { WorkmapWidget } from "../src/widget.js";

const nodes: WorkmapNode[] = [
	{ id: "alignment", type: "goal", title: "Keep human and Agent aligned", status: "long-term" },
	{ id: "storage", type: "decision", title: "Use session-global snapshots", status: "chosen" },
	{ id: "session_tree", type: "understanding", title: "Tree navigation must not roll back the map" },
	{ id: "wrong_direction", type: "drift", title: "Implementation is becoming a todo manager", status: "detected" },
	{ id: "render_widget", type: "task", title: "Render the persistent widget", status: "active", parentId: "storage" },
	{ id: "display_mode", type: "unknown", title: "How many compact rows remain readable?", status: "open" },
];

function renderWidget(expanded: boolean): { lines: string[]; requestRender: ReturnType<typeof vi.fn> } {
	let factory: ((tui: TUI, theme: Theme) => Component) | undefined;
	const requestRender = vi.fn();
	const ui = {
		setWidget: vi.fn((_key: string, value: unknown) => {
			if (typeof value === "function") factory = value as (tui: TUI, theme: Theme) => Component;
		}),
		getToolsExpanded: vi.fn(() => expanded),
	} as unknown as ExtensionUIContext;
	const theme = new Proxy(
		{},
		{
			get: (_target, property) => (property === "fg" ? (_color: string, text: string) => text : (text: string) => text),
		},
	) as Theme;
	const widget = new WorkmapWidget(() => nodes.map((node) => ({ ...node })));
	widget.attach(ui);
	const component = factory?.({ requestRender } as unknown as TUI, theme);
	if (!component) throw new Error("Widget factory was not registered");
	return { lines: component.render(78), requestRender };
}

describe("WorkmapWidget", () => {
	it("keeps compact mode restrained and prioritizes alignment signals", () => {
		const { lines } = renderWidget(false);
		const output = lines.join("\n");

		expect(lines.length).toBe(7);
		expect(output).toContain("Keep human and Agent aligned");
		expect(output).toContain("Implementation is becoming a todo manager");
		expect(output).toContain("How many compact rows remain readable?");
		expect(output).not.toContain("Tree navigation must not roll back");
		expect(output).toContain("… 1 more");
	});

	it("renders the full information tree and notes when Pi is expanded", () => {
		const withNote = nodes.map((node) =>
			node.id === "render_widget"
				? { ...node, note: "The widget stays above the editor and follows Pi's expansion state." }
				: node,
		);
		nodes.splice(0, nodes.length, ...withNote);
		const { lines } = renderWidget(true);
		const output = lines.join("\n");

		expect(output).toContain("Tree navigation must not roll back the map");
		expect(output).toContain("└─ □ Render the persistent widget");
		expect(output).toContain("The widget stays above the editor");
	});
});
