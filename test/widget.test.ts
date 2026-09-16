import type { ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import type { WorkmapRoot } from "../src/types.js";
import { WorkmapWidget } from "../src/widget.js";

const goal = { title: "Keep human and Agent aligned", label: "long-term" };

const nodes: WorkmapRoot[] = [
	{
		type: "decision",
		title: "Use session-global snapshots",
		label: "chosen",
		children: [{ type: "task", title: "Render the persistent widget", label: "active" }],
	},
	{ type: "understanding", title: "Tree navigation must not roll back the map" },
	{ type: "drift", title: "Implementation is becoming a todo manager", label: "detected" },
	{ type: "decision", title: "Which labels stay readable on narrow terminals?", label: "considering" },
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
	const widget = new WorkmapWidget(() => ({ goal, nodes: structuredClone(nodes) }));
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
		expect(lines).toHaveLength(9);
		expect(lines.join("\n")).toMatchSnapshot();
		nodes.splice(4, 3);
	});

	it("drops labels before squeezing titles on narrow widths (snapshot)", () => {
		const { lines } = renderWidget(24);
		expect(lines.join("\n")).toMatchSnapshot();
	});

	it("keeps labels right-aligned when there is room (snapshot)", () => {
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
