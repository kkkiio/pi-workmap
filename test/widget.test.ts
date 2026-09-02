import type { ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import type { WorkmapRoot } from "../src/types.js";
import { WorkmapWidget } from "../src/widget.js";

const nodes: WorkmapRoot[] = [
	{ type: "heading", title: "Keep human and Agent aligned", status: "long-term" },
	{
		type: "decision",
		title: "Use session-global snapshots",
		status: "chosen",
		children: [{ type: "task", title: "Render the persistent widget", status: "active" }],
	},
	{ type: "understanding", title: "Tree navigation must not roll back the map" },
	{ type: "drift", title: "Implementation is becoming a todo manager", status: "detected" },
	{ type: "decision", title: "Which statuses stay readable on narrow terminals?", status: "considering" },
];

function renderWidget(width = 78): { lines: string[]; requestRender: ReturnType<typeof vi.fn> } {
	let factory: ((tui: TUI, theme: Theme) => Component) | undefined;
	const requestRender = vi.fn();
	const ui = {
		setWidget: vi.fn((_key: string, value: unknown) => {
			if (typeof value === "function") factory = value as (tui: TUI, theme: Theme) => Component;
		}),
	} as unknown as ExtensionUIContext;
	const theme = new Proxy(
		{},
		{
			get: (_target, property) => (property === "fg" ? (_color: string, text: string) => text : (text: string) => text),
		},
	) as Theme;
	const widget = new WorkmapWidget(() => structuredClone(nodes));
	widget.attach(ui);
	const component = factory?.({ requestRender } as unknown as TUI, theme);
	if (!component) throw new Error("Widget factory was not registered");
	return { lines: component.render(width), requestRender };
}

describe("WorkmapWidget", () => {
	it("renders the full tree at standard width (snapshot)", () => {
		const { lines } = renderWidget();
		expect(lines.join("\n")).toMatchSnapshot();
	});

	it("renders past the former compact budget without hidden counts (snapshot)", () => {
		nodes.push(
			{ type: "task", title: "Extra task one" },
			{ type: "task", title: "Extra task two" },
			{ type: "task", title: "Extra task three" },
		);
		const { lines } = renderWidget();
		expect(lines).toHaveLength(1 + 9);
		expect(lines.join("\n")).toMatchSnapshot();
		nodes.splice(5, 3);
	});

	it("drops statuses before squeezing titles on narrow widths (snapshot)", () => {
		const { lines } = renderWidget(24);
		expect(lines.join("\n")).toMatchSnapshot();
	});

	it("keeps statuses right-aligned when there is room (snapshot)", () => {
		const { lines } = renderWidget(60);
		expect(lines.join("\n")).toMatchSnapshot();
	});

	it("aligns every title to its depth column despite double-width glyphs", () => {
		const { lines } = renderWidget();
		const flat: { title: string; depth: number }[] = [];
		const walk = (list: WorkmapRoot[], depth: number): void => {
			for (const node of list) {
				flat.push({ title: node.title, depth });
				for (const child of node.children ?? []) flat.push({ title: child.title, depth: depth + 1 });
			}
		};
		walk(nodes, 0);
		for (const node of flat) {
			const line = lines.find((candidate) => candidate.includes(node.title));
			if (!line) continue;
			expect(visibleWidth(line.slice(0, line.indexOf(node.title)))).toBe(node.depth > 0 ? 6 : 3);
		}
	});
});
