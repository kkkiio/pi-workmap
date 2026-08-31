import type { ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import type { WorkmapNode } from "../src/types.js";
import { WorkmapWidget } from "../src/widget.js";

const nodes: WorkmapNode[] = [
	{ id: "alignment", type: "heading", title: "Keep human and Agent aligned", status: "long-term" },
	{ id: "storage", type: "decision", title: "Use session-global snapshots", status: "chosen" },
	{ id: "session_tree", type: "understanding", title: "Tree navigation must not roll back the map" },
	{ id: "wrong_direction", type: "drift", title: "Implementation is becoming a todo manager", status: "detected" },
	{ id: "render_widget", type: "task", title: "Render the persistent widget", status: "active", parentId: "storage" },
	{ id: "display_mode", type: "decision", title: "How many compact rows remain readable?", status: "considering" },
];

function renderWidget(expanded: boolean, width = 78): { lines: string[]; requestRender: ReturnType<typeof vi.fn> } {
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
	return { lines: component.render(width), requestRender };
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
		expect(output).toContain("└─ □  Render the persistent widget");
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
		expect(output).toContain("└─ □  Render the persistent widget");
		expect(output).toContain("The widget stays above the editor");
	});

	it("describes hidden compact nodes by type", () => {
		const { lines } = renderWidget(false);
		expect(lines.at(-1)).toBe("  … 1 more · 1 understanding");
	});

	it("aligns every title to its depth column despite double-width glyphs", () => {
		const { lines } = renderWidget(false);
		for (const node of nodes) {
			const line = lines.find((candidate) => candidate.includes(node.title));
			if (!line) continue;
			expect(visibleWidth(line.slice(0, line.indexOf(node.title)))).toBe(node.parentId ? 6 : 3);
		}
	});

	it("caps each cluster so one fat tree cannot crowd out other signals", () => {
		const original = nodes.map((node) => ({ ...node }));
		nodes.splice(
			0,
			nodes.length,
			{ id: "alignment", type: "heading", title: "Keep human and Agent aligned", status: "long-term" },
			{
				id: "wrong_direction",
				type: "drift",
				title: "Implementation is becoming a todo manager",
				status: "detected",
			},
			{ id: "storage", type: "decision", title: "Use session-global snapshots", status: "chosen" },
			{ id: "sub_alpha", type: "option", title: "Option alpha", parentId: "storage" },
			{ id: "sub_beta", type: "option", title: "Option beta", parentId: "storage" },
			{ id: "sub_gamma", type: "option", title: "Option gamma", parentId: "storage" },
			{ id: "sub_delta", type: "option", title: "Option delta", parentId: "storage" },
			{
				id: "render_widget",
				type: "task",
				title: "Render the persistent widget",
				status: "active",
				parentId: "storage",
			},
		);
		const { lines } = renderWidget(false);
		const output = lines.join("\n");

		expect(output).toContain("Use session-global snapshots");
		expect(output).toContain("Option alpha");
		expect(output).toContain("Option beta");
		expect(output).not.toContain("Option gamma");
		expect(output).not.toContain("Render the persistent widget");
		expect(lines.at(-1)).toBe("  … 3 more · 2 options · 1 task");
		nodes.splice(0, nodes.length, ...original);
	});

	it("renders the nested signal that promoted its cluster", () => {
		const original = nodes.map((node) => ({ ...node }));
		nodes.splice(
			0,
			nodes.length,
			{ id: "probe", type: "task", title: "Probe the refresh path", status: "active" },
			{ id: "choose", type: "decision", title: "Pick an approach", status: "considering", parentId: "probe" },
			{ id: "opt_a", type: "option", title: "Approach A", parentId: "choose" },
			{ id: "context", type: "understanding", title: "Requests overlap", parentId: "probe" },
			{
				id: "off_course",
				type: "drift",
				title: "Fix assumed a single worker",
				status: "detected",
				parentId: "context",
			},
		);
		const { lines } = renderWidget(false);
		const output = lines.join("\n");

		expect(output).toContain("Fix assumed a single worker");
		expect(lines.at(-1)).toBe("  … 2 more · 1 decision · 1 option");
		nodes.splice(0, nodes.length, ...original);
	});

	it("drops statuses and the hint before squeezing titles on narrow widths", () => {
		const { lines } = renderWidget(false, 24);
		const output = lines.join("\n");

		expect(output).toContain("Workmap");
		expect(output).not.toContain("long-term");
		expect(output).not.toContain("detected");
		expect(lines[1].startsWith("◎  Keep human")).toBe(true);
	});

	it("keeps statuses right-aligned when there is room", () => {
		const { lines } = renderWidget(false, 60);
		const goal = lines.find((line) => line.includes("Keep human and Agent aligned"));
		expect(goal?.endsWith("long-term")).toBe(true);
	});
});
