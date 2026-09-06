import type { ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import { type TUI, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { WorkmapNodeType } from "./agent_api.js";
import { orderedRoots } from "./agent_api.js";
import { countNodes, type WorkmapChild, type WorkmapView } from "./types.js";

// Titles stay readable only with at least this many columns; below it, right-aligned labels are dropped.
const MIN_LEFT_WIDTH = 20;
// Every glyph occupies a two-column cell so double-width glyphs keep titles left-aligned.
const GLYPH_CELL_WIDTH = 2;
// The goal row glyph — goal is the intent signal written through `set_goal`,
// rendered as its own top row rather than a restate-written node (ADR 0017).
const GOAL_GLYPH = "✦";

export const PRESENTATION: Record<
	WorkmapNodeType,
	{ glyph: string; glyphColor: "accent" | "error" | "warning" | "text" }
> = {
	understanding: { glyph: "•", glyphColor: "text" },
	decision: { glyph: "◆", glyphColor: "accent" },
	option: { glyph: "◇", glyphColor: "text" },
	task: { glyph: "◎", glyphColor: "text" },
	drift: { glyph: "⎇", glyphColor: "error" },
};

export function glyphCell(type: WorkmapNodeType): string {
	const { glyph } = PRESENTATION[type];
	return glyph + " ".repeat(Math.max(0, GLYPH_CELL_WIDTH - visibleWidth(glyph)));
}

export class WorkmapWidget {
	private ui: ExtensionUIContext | undefined;
	private tui: TUI | undefined;
	private registered = false;

	constructor(private readonly getView: () => WorkmapView) {}

	attach(ui: ExtensionUIContext): void {
		if (this.ui !== ui && this.registered && this.ui) this.ui.setWidget("workmap", undefined);
		this.ui = ui;
		this.registered = false;
		this.tui = undefined;
		this.update();
	}

	update(): void {
		if (!this.ui) return;
		const view = this.getView();
		if (view.nodes.length === 0 && !view.goal) {
			if (this.registered) this.ui.setWidget("workmap", undefined);
			this.registered = false;
			this.tui = undefined;
			return;
		}
		if (!this.registered) {
			this.ui.setWidget(
				"workmap",
				(tui, theme) => {
					this.tui = tui;
					return {
						render: (width: number) => this.render(width, theme),
						invalidate: () => undefined,
					};
				},
				{ placement: "aboveEditor" },
			);
			this.registered = true;
			return;
		}
		this.tui?.requestRender();
	}

	dispose(): void {
		if (this.ui && this.registered) this.ui.setWidget("workmap", undefined);
		this.registered = false;
		this.tui = undefined;
		this.ui = undefined;
	}

	// Single rendering mode: the complete two-layer tree, every node visible
	// (ADR 0015). The ≤10 backstop in state guarantees this never overflows —
	// there is nothing hidden. The goal row leads (ADR 0009), drift follows.
	private render(width: number, theme: Theme): string[] {
		try {
			const view = this.getView();
			if ((view.nodes.length === 0 && !view.goal) || width < 8) return [];
			const lines: string[] = [];
			lines.push(theme.fg("accent", theme.bold(this.renderSummary(view, theme))));
			if (view.goal) {
				const left = `${theme.fg("accent", `${GOAL_GLYPH} `)}${theme.fg("text", view.goal.title)}`;
				lines.push(
					view.goal.label ? this.align(left, theme.fg("dim", view.goal.label), width) : truncateToWidth(left, width),
				);
			}
			const ordered = orderedRoots(view.nodes);
			for (const root of ordered) {
				lines.push(this.renderNode(root, "", width, theme));
				const children = root.children ?? [];
				children.forEach((child, index) => {
					const connector = index === children.length - 1 ? "└─ " : "├─ ";
					lines.push(this.renderNode(child, connector, width, theme));
				});
			}
			return lines.map((line) => truncateToWidth(line, width));
		} catch {
			return [];
		}
	}

	private renderSummary(view: WorkmapView, theme: Theme): string {
		let driftCount = 0;
		for (const node of view.nodes) {
			if (node.type === "drift") driftCount += 1;
			for (const child of node.children ?? []) {
				if (child.type === "drift") driftCount += 1;
			}
		}
		// The goal is a signal too (ADR 0017): the count includes it.
		const total = countNodes(view.nodes) + (view.goal ? 1 : 0);
		const base = theme.fg("accent", theme.bold(`Workmap · ${total} signals`));
		if (!driftCount) return base;
		return `${base} ${theme.fg("error", theme.bold(`· ${driftCount} drift`))}`;
	}

	private renderNode(node: WorkmapChild, prefix: string, width: number, theme: Theme): string {
		const presentation = PRESENTATION[node.type];
		const left = `${theme.fg("dim", prefix)}${theme.fg(presentation.glyphColor, glyphCell(node.type))} ${theme.fg("text", node.title)}`;
		if (!node.label) return truncateToWidth(left, width);
		return this.align(left, theme.fg("dim", node.label), width);
	}

	private align(left: string, right: string, width: number): string {
		const rightWidth = visibleWidth(right);
		if (!right || rightWidth + MIN_LEFT_WIDTH + 2 > width) return truncateToWidth(left, width);
		const availableLeft = Math.max(1, width - rightWidth - 2);
		const clippedLeft = truncateToWidth(left, availableLeft);
		const gap = Math.max(2, width - visibleWidth(clippedLeft) - rightWidth);
		return truncateToWidth(`${clippedLeft}${" ".repeat(gap)}${right}`, width);
	}
}
