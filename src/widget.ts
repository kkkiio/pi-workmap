import { type ExtensionUIContext, keyText, type Theme } from "@earendil-works/pi-coding-agent";
import { type TUI, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { WorkmapNode, WorkmapNodeType } from "./types.js";

const COMPACT_NODE_LIMIT = 5;
// A cluster (root plus descendants) gets at most this many compact rows so one
// fat tree cannot crowd every other signal off the widget.
const COMPACT_CLUSTER_LIMIT = 3;
// Titles stay readable only with at least this many columns; below it, right-aligned labels are dropped.
const MIN_LEFT_WIDTH = 20;
// Every glyph occupies a two-column cell so double-width glyphs (⚡) keep titles left-aligned.
const GLYPH_CELL_WIDTH = 2;
export const PRESENTATION: Record<
	WorkmapNodeType,
	{ glyph: string; glyphColor: "accent" | "error" | "warning" | "text" }
> = {
	heading: { glyph: "◎", glyphColor: "accent" },
	understanding: { glyph: "•", glyphColor: "text" },
	decision: { glyph: "◆", glyphColor: "accent" },
	option: { glyph: "◇", glyphColor: "text" },
	task: { glyph: "□", glyphColor: "text" },
	drift: { glyph: "⚡", glyphColor: "error" },
};
const COMPACT_PRIORITY: Record<WorkmapNodeType, number> = {
	heading: 0,
	drift: 1,
	decision: 2,
	// Options rank right after their decision: inside a decision cluster they are
	// the defining children and must outrank any tasks or understandings below it.
	option: 3,
	task: 4,
	understanding: 5,
};

export function glyphCell(type: WorkmapNodeType): string {
	const { glyph } = PRESENTATION[type];
	return glyph + " ".repeat(Math.max(0, GLYPH_CELL_WIDTH - visibleWidth(glyph)));
}

export class WorkmapWidget {
	private ui: ExtensionUIContext | undefined;
	private tui: TUI | undefined;
	private registered = false;

	constructor(private readonly getNodes: () => WorkmapNode[]) {}

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

	private render(width: number, theme: Theme): string[] {
		try {
			const nodes = this.getNodes();
			if (nodes.length === 0 || width < 8) return [];
			const expanded = this.ui?.getToolsExpanded() ?? false;
			const summary = this.renderSummary(nodes, theme);
			const shortcut = keyText("app.tools.expand");
			const hint = shortcut ? `${shortcut} ${expanded ? "compact" : "expand"}` : expanded ? "expanded" : "compact";
			const lines = [this.align(theme.fg("accent", theme.bold(summary)), theme.fg("dim", hint), width)];

			if (!expanded) {
				// Compact samples clusters, not lone nodes: a child stripped of its parent
				// loses meaning (an option says nothing without its decision). Each cluster
				// ranks by its most alignment-critical member and renders as an indented
				// tree, capped per cluster to keep the lineup diverse.
				const indexOf = new Map(nodes.map((node, index) => [node.id, index] as const));
				const compare = (left: WorkmapNode, right: WorkmapNode): number =>
					COMPACT_PRIORITY[left.type] - COMPACT_PRIORITY[right.type] ||
					(indexOf.get(left.id) ?? 0) - (indexOf.get(right.id) ?? 0);
				const children = new Map<string, WorkmapNode[]>();
				for (const node of nodes) {
					if (!node.parentId) continue;
					const siblings = children.get(node.parentId) ?? [];
					siblings.push(node);
					children.set(node.parentId, siblings);
				}
				for (const siblings of children.values()) siblings.sort(compare);
				const clusterRank = (root: WorkmapNode): number => {
					let best = COMPACT_PRIORITY[root.type];
					const stack = [...(children.get(root.id) ?? [])];
					while (stack.length > 0) {
						const node = stack.pop() as WorkmapNode;
						best = Math.min(best, COMPACT_PRIORITY[node.type]);
						stack.push(...(children.get(node.id) ?? []));
					}
					return best;
				};
				const roots = nodes
					.filter((node) => !node.parentId)
					.map((root) => ({ root, rank: clusterRank(root) }))
					.sort((left, right) => left.rank - right.rank || compare(left.root, right.root));
				const shown = new Set<string>();
				let budget = COMPACT_NODE_LIMIT;
				const visit = (
					node: WorkmapNode,
					prefix: string,
					connector: string,
					childPrefix: string,
					clusterBudget: { rows: number },
				): void => {
					if (budget <= 0 || clusterBudget.rows <= 0) return;
					lines.push(this.renderNode(node, `${prefix}${connector}`, width, theme));
					shown.add(node.id);
					budget -= 1;
					clusterBudget.rows -= 1;
					const descendants = children.get(node.id) ?? [];
					for (const [index, child] of descendants.entries()) {
						const last = index === descendants.length - 1;
						visit(child, `${prefix}${childPrefix}`, last ? "└─ " : "├─ ", last ? "   " : "│  ", clusterBudget);
					}
				};
				for (const { root } of roots) {
					if (budget <= 0) break;
					visit(root, "", "", "", { rows: COMPACT_CLUSTER_LIMIT });
				}
				const hidden = nodes.filter((node) => !shown.has(node.id));
				if (hidden.length > 0) lines.push(theme.fg("dim", `  ${this.summarizeHidden(hidden)}`));
				return lines.map((line) => truncateToWidth(line, width));
			}

			const children = new Map<string, WorkmapNode[]>();
			for (const node of nodes) {
				if (!node.parentId) continue;
				const siblings = children.get(node.parentId) ?? [];
				siblings.push(node);
				children.set(node.parentId, siblings);
			}
			// Heading roots lead the expanded tree, following the tech-doc
			// convention that the goals section precedes the details.
			const roots = [
				...nodes.filter((node) => !node.parentId && node.type === "heading"),
				...nodes.filter((node) => !node.parentId && node.type !== "heading"),
			];
			const visit = (node: WorkmapNode, prefix: string, connector: string, childPrefix: string): void => {
				lines.push(this.renderNode(node, `${prefix}${connector}`, width, theme));
				if (node.note) {
					const notePrefix = `${prefix}${childPrefix}   `;
					const noteWidth = Math.max(1, width - visibleWidth(notePrefix));
					for (const part of wrapTextWithAnsi(node.note, noteWidth).slice(0, 2)) {
						lines.push(truncateToWidth(theme.fg("dim", notePrefix + part), width));
					}
				}
				const descendants = children.get(node.id) ?? [];
				for (const [index, child] of descendants.entries()) {
					const last = index === descendants.length - 1;
					visit(child, `${prefix}${childPrefix}`, last ? "└─ " : "├─ ", last ? "   " : "│  ");
				}
			};
			for (const root of roots) visit(root, "", "", "");
			return lines.map((line) => truncateToWidth(line, width));
		} catch {
			return [];
		}
	}

	private renderSummary(nodes: WorkmapNode[], theme: Theme): string {
		const driftCount = nodes.filter((node) => node.type === "drift").length;
		const base = theme.fg("accent", theme.bold(`Workmap · ${nodes.length} signals`));
		if (!driftCount) return base;
		return `${base} ${theme.fg("error", theme.bold(`· ${driftCount} drift`))}`;
	}

	private summarizeHidden(hidden: WorkmapNode[]): string {
		const counts = new Map<WorkmapNodeType, number>();
		for (const node of hidden) counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
		const parts = [...counts.entries()]
			.sort((left, right) => COMPACT_PRIORITY[left[0]] - COMPACT_PRIORITY[right[0]])
			.map(([type, count]) => `${count} ${type}${count === 1 ? "" : "s"}`);
		return `… ${hidden.length} more · ${parts.join(" · ")}`;
	}

	private renderNode(node: WorkmapNode, prefix: string, width: number, theme: Theme): string {
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
