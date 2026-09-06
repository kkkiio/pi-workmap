import { type ExtensionAPI, SessionManager } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	AddDriftParams,
	PROMPT_GUIDELINES,
	renderStateMessage,
	renderTreeLines,
	SetGoalParams,
	SetParams,
	TOOL_DESCRIPTIONS,
} from "./agent_api.js";
import { persistSnapshot } from "./session-entry.js";
import { WorkmapStore } from "./store.js";
import { countNodes, type WorkmapChild, type WorkmapRoot, type WorkmapToolDetails } from "./types.js";
import { glyphCell, PRESENTATION, WorkmapWidget } from "./widget.js";

export default function workmapExtension(pi: ExtensionAPI): void {
	const store = new WorkmapStore();
	const widget = new WorkmapWidget(() => store.view());
	let activeSessionId: string | undefined;
	// User prompts since the last restate call. The MUST in the prompt guidelines
	// lowers forgetting but cannot eliminate it; this counter makes a stale map
	// visible to the model via the injected footer (escalated at >= 2).
	let promptsSinceRewrite = 0;

	pi.on("session_start", async (event, ctx) => {
		promptsSinceRewrite = 0;
		const nextSessionId = ctx.sessionManager.getSessionId();
		if (event.reason === "new") {
			store.clear();
		} else if (event.reason === "fork" && event.previousSessionFile) {
			store.restore(SessionManager.open(event.previousSessionFile));
			const view = store.view();
			persistSnapshot(pi, view.nodes, view.goal);
		} else {
			store.restore(ctx.sessionManager);
		}
		activeSessionId = nextSessionId;
		widget.attach(ctx.ui);
	});

	pi.on("session_tree", async (_event, ctx) => {
		// Branch navigation is not a new session and the map is session-global.
		store.restore(ctx.sessionManager);
		widget.update();
	});

	pi.on("session_shutdown", async () => {
		widget.dispose();
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		if (activeSessionId !== ctx.sessionManager.getSessionId()) {
			store.restore(ctx.sessionManager);
			activeSessionId = ctx.sessionManager.getSessionId();
			widget.attach(ctx.ui);
			promptsSinceRewrite = 0;
		}
		promptsSinceRewrite += 1;
		const view = store.view();
		if (view.nodes.length === 0 && !view.goal) return {};
		// Re-inject on every run (ADR 0010): the recurring tail position keeps the
		// anchor salient, and the footer escalates when the map goes stale.
		return {
			message: {
				customType: "pi-workmap-context",
				content: renderStateMessage(view.nodes, view.goal, { promptsSinceRewrite }),
				display: false,
			},
		};
	});

	const finish = (
		action: WorkmapToolDetails["action"],
		result: { changed: boolean; error?: string },
	): { content: { type: "text"; text: string }[]; details: WorkmapToolDetails; isError: boolean } => {
		const { changed, error } = result;
		const view = store.view();
		// Persist every accepted mutation; restore reads the newest snapshot.
		if (changed) persistSnapshot(pi, view.nodes, view.goal);
		const total = countNodes(view.nodes) + (view.goal ? 1 : 0);
		// Echo the resulting declaration: the model must see the structure it just
		// declared, so an unintended flattening, a dropped subtree, or a miscount
		// is visible next turn.
		const headerText = view.goal ? `goal${view.goal.label ? ` [${view.goal.label}]` : ""}: ${view.goal.title}\n` : "";
		const treeText = renderTreeLines(view.nodes).join("\n");
		const text = error
			? `Workmap update rejected: ${error}`
			: `${changed ? "Updated" : "No change to"} workmap · ${total} signal${total === 1 ? "" : "s"}${
					view.goal || view.nodes.length > 0 ? `\n${headerText}${treeText}` : ""
				}`;
		const details: WorkmapToolDetails = {
			version: 7,
			action,
			changed,
			...(error ? { error } : {}),
			...(view.goal ? { goal: view.goal } : {}),
			nodes: view.nodes,
		};
		return { content: [{ type: "text", text }], details, isError: Boolean(error) };
	};

	pi.registerTool({
		name: "restate",
		label: "Restate",
		description: TOOL_DESCRIPTIONS.restate,
		promptSnippet:
			"Maintain the live workmap that lets the user inspect your current direction and follow your operational mental model.",
		promptGuidelines: PROMPT_GUIDELINES,
		parameters: SetParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			// Only an accepted declaration re-anchors the map: a rejected restate
			// changed nothing, and resetting here would let repeated invalid calls
			// suppress the stale warning indefinitely.
			const result = store.set((params as { set: WorkmapRoot[] }).set);
			if (!result.error) promptsSinceRewrite = 0;
			widget.update();
			return finish("set", result);
		},
		renderCall(args, theme) {
			const additions = (args as { set?: unknown[] }).set?.length ?? 0;
			return new Text(theme.fg("toolTitle", theme.bold("restate ")) + theme.fg("muted", `${additions} signals`), 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			return renderDetails(result, expanded, theme);
		},
	});

	pi.registerTool({
		name: "set_goal",
		label: "Set goal",
		description: TOOL_DESCRIPTIONS.set_goal,
		promptSnippet: "Distill the user's ultimate want into the goal row before acting on a new or changed request.",
		parameters: SetGoalParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			// A goal is not a rewrite: the stale counter keeps counting until a full
			// signal declaration re-anchors the map.
			const { title, label } = params as { title: string; label?: string };
			const result = store.setGoal(title, label);
			widget.update();
			return finish("set_goal", result);
		},
		renderCall(args, theme) {
			const title = (args as { title?: string }).title ?? "";
			return new Text(theme.fg("toolTitle", theme.bold("set_goal ")) + theme.fg("muted", title), 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			return renderDetails(result, expanded, theme);
		},
	});

	pi.registerTool({
		name: "add_drift",
		label: "Add drift",
		description: TOOL_DESCRIPTIONS.add_drift,
		promptSnippet: "Report a mid-task course change as drift the moment it happens.",
		parameters: AddDriftParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			// A drift is an append, not a rewrite: the counter keeps counting until a
			// full signal declaration re-anchors the map.
			const result = store.addDrift((params as { title: string }).title);
			widget.update();
			return finish("add", result);
		},
		renderCall(args, theme) {
			const title = (args as { title?: string }).title ?? "";
			return new Text(theme.fg("toolTitle", theme.bold("add_drift ")) + theme.fg("muted", title), 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			return renderDetails(result, expanded, theme);
		},
	});
}

function renderDetails(
	result: { details?: unknown },
	expanded: boolean,
	theme: { fg(color: string, text: string): string; bold(text: string): string },
): Text {
	const details = result.details as WorkmapToolDetails | undefined;
	if (!details) return new Text("", 0, 0);
	if (details.error) return new Text(theme.fg("error", details.error), 0, 0);
	let text = theme.fg("success", details.changed ? "Workmap updated" : "Workmap unchanged");
	if (expanded && (details.nodes.length > 0 || details.goal)) {
		const rows: string[] = [];
		if (details.goal) {
			rows.push(
				theme.fg(
					"accent",
					`✦ ${details.goal.title}${details.goal.label ? theme.fg("dim", ` ${details.goal.label}`) : ""}`,
				),
			);
		}
		const render = (node: WorkmapChild, depth: number): void => {
			const presentation = PRESENTATION[node.type];
			const indent = "  ".repeat(depth);
			const label = node.label ? theme.fg("dim", ` ${node.label}`) : "";
			rows.push(
				`${indent}${theme.fg(presentation.glyphColor, glyphCell(node.type))} ${theme.fg("text", node.title)}${label}`,
			);
		};
		for (const root of details.nodes) {
			render(root, 0);
			for (const child of root.children ?? []) render(child, 1);
		}
		text += `\n${rows.join("\n")}`;
	} else {
		text += theme.fg("dim", ` · ${countNodes(details.nodes)} signals`);
	}
	return new Text(text, 0, 0);
}
