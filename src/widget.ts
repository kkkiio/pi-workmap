import type { ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import { type TUI, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { countNodes, type WorkmapChild, type WorkmapNodeType, type WorkmapRoot } from "./types.js";

// Titles stay readable only with at least this many columns; below it, right-aligned labels are dropped.
const MIN_LEFT_WIDTH = 20;
// Every glyph occupies a two-column cell so double-width glyphs keep titles left-aligned.
const GLYPH_CELL_WIDTH = 2;
export const PRESENTATION: Record<
	WorkmapNodeType,
	{ glyph: string; glyphColor: "accent" | "error" | "warning" | "text" }
> = {
	heading: { glyph: "✦", glyphColor: "accent" },
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

	constructor(private readonly getNodes: () => WorkmapRoot[]) {}

	attach(ui: ExtensionUIContext): void {
		if (this.ui !== ui && this.registered && this.ui) this.ui.setWidget("workmap", undefined);
		this.ui = ui;
		this.registered = false;
		this.tui = undefined;
		this.update();
	}

	update(): void {
		if (!this.ui) return;
		if (this.getNodes().length === 0) {
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

	// Single rendering mode: the complete tree, every node visible (ADR 0013). The
	// node cap in state guarantees this never overflows — there is nothing hidden.
	private render(width: number, theme: Theme): string[] {
		try {
			const nodes = this.getNodes();
			if (nodes.length === 0 || width < 8) return [];
			const lines = [theme.fg("accent", theme.bold(this.renderSummary(nodes, theme)))];
			// Heading roots lead the tree, following the tech-doc convention that the
			// goals section precedes the details.
			const ordered = [
				...nodes.filter((node) => node.type === "heading"),
				...nodes.filter((node) => node.type !== "heading"),
			];
			const visit = (node: WorkmapChild, prefix: string, connector: string, childPrefix: string): void => {
				lines.push(this.renderNode(node, `${prefix}${connector}`, width, theme));
				const descendants = node.children ?? [];
				for (const [index, child] of descendants.entries()) {
					const last = index === descendants.length - 1;
					visit(child, `${prefix}${childPrefix}`, last ? "└─ " : "├─ ", last ? "   " : "│  ");
				}
			};
			for (const root of ordered) visit(root, "", "", "");
			return lines.map((line) => truncateToWidth(line, width));
		} catch {
			return [];
		}
	}

	private renderSummary(nodes: WorkmapRoot[], theme: Theme): string {
		let driftCount = 0;
		const stack: WorkmapChild[] = [...nodes];
		while (stack.length > 0) {
			const node = stack.pop() as WorkmapChild;
			if (node.type === "drift") driftCount += 1;
			if (node.children) stack.push(...node.children);
		}
		const base = theme.fg("accent", theme.bold(`Workmap · ${countNodes(nodes)} signals`));
		if (!driftCount) return base;
		return `${base} ${theme.fg("error", theme.bold(`· ${driftCount} drift`))}`;
	}

	private renderNode(node: WorkmapChild, prefix: string, width: number, theme: Theme): string {
		const presentation = PRESENTATION[node.type];
		const left = `${theme.fg("dim", prefix)}${theme.fg(presentation.glyphColor, glyphCell(node.type))} ${theme.fg("text", node.title)}`;
		if (!node.status) return truncateToWidth(left, width);
		return this.align(left, theme.fg("dim", node.status), width);
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
