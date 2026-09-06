import { type ExtensionAPI, SessionManager } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { renderStateMessage } from "./context-message.js";
import { GoalSchema, RootSchema } from "./node-types.js";
import { persistSnapshot, WORKMAP_SNAPSHOT_VERSION } from "./session-entry.js";
import { WorkmapState } from "./state.js";
import { countNodes, type WorkmapChild, type WorkmapToolDetails } from "./types.js";
import { glyphCell, PRESENTATION, WorkmapWidget } from "./widget.js";

const SetParams = Type.Object(
	{
		set: Type.Array(RootSchema, {
			description:
				"The COMPLETE signal tree, replacing everything. An empty array clears the signals; the goal is separate and managed by set_goal.",
		}),
	},
	{ additionalProperties: false },
);

const AddDriftParams = Type.Object(
	{
		title: Type.String({ description: "The mismatch, one scannable sentence", minLength: 1, maxLength: 120 }),
	},
	{ additionalProperties: false },
);

export default function workmapExtension(pi: ExtensionAPI): void {
	const state = new WorkmapState();
	const widget = new WorkmapWidget(() => state.view());
	let activeSessionId: string | undefined;

	pi.on("session_start", async (event, ctx) => {
		const nextSessionId = ctx.sessionManager.getSessionId();
		if (event.reason === "new") {
			state.clear();
		} else if (event.reason === "fork" && event.previousSessionFile) {
			state.restore(SessionManager.open(event.previousSessionFile));
			persistSnapshot(pi, state.view());
		} else {
			state.restore(ctx.sessionManager);
		}
		activeSessionId = nextSessionId;
		widget.attach(ctx.ui);
	});

	pi.on("session_tree", async (_event, ctx) => {
		// Branch navigation is not a new session and the map is session-global.
		state.restore(ctx.sessionManager);
		widget.update();
	});

	pi.on("session_shutdown", async () => {
		widget.dispose();
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		if (activeSessionId !== ctx.sessionManager.getSessionId()) {
			state.restore(ctx.sessionManager);
			activeSessionId = ctx.sessionManager.getSessionId();
			widget.attach(ctx.ui);
		}
		const view = state.view();
		if (view.nodes.length === 0 && !view.goal) return {};
		return {
			message: {
				customType: "pi-workmap-context",
				content: renderStateMessage(view),
				display: false,
			},
		};
	});

	const finish = (
		action: WorkmapToolDetails["action"],
		result: { changed: boolean; error?: string },
	): { content: { type: "text"; text: string }[]; details: WorkmapToolDetails; isError: boolean } => {
		const { changed, error } = result;
		const current = state.view();
		// Persist every accepted mutation; restore reads the newest snapshot.
		if (changed) persistSnapshot(pi, current);
		const total = countNodes(current);
		const text = error
			? `Workmap update rejected: ${error}`
			: `${changed ? "Updated" : "No change to"} workmap · ${total} signal${total === 1 ? "" : "s"}`;
		const details: WorkmapToolDetails = {
			version: WORKMAP_SNAPSHOT_VERSION,
			action,
			changed,
			...(error ? { error } : {}),
			...current,
		};
		return { content: [{ type: "text", text }], details, isError: Boolean(error) };
	};

	pi.registerTool({
		name: "restate",
		label: "Restate",
		description: "Restate the COMPLETE signal tree, replacing everything. An empty array clears the signals.",
		promptSnippet:
			"Maintain the live workmap that lets the user inspect your current direction and follow your operational mental model.",
		promptGuidelines: [
			"You MUST restate the complete signal map before your first action after every user prompt; an empty array clears the signals.",
			'Use decision for deliberation or commitments — title a question while deliberating, and once decided append the conclusion ("Where should X live? → on the server"); use option only for considered alternatives under their decision.',
			"Use understanding for current facts, syntheses, and hypotheses; counterintuitive findings belong here precisely because they are easy to lose — label assumed until verified.",
			"Use task for actions you intend, are doing, or have done; a done title records side effects — what changed, what ran.",
		],
		parameters: SetParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const result = state.set({ ...state.view(), nodes: params.set });
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
		description:
			"Distill the user's ultimate want — the destination, never the route. The goal outlives signal rewrites.",
		promptSnippet: "Distill the user's ultimate want into the goal row before acting on a new or changed request.",
		promptGuidelines: [
			"You MUST distill the user's ultimate want into the goal via `set_goal` before acting on a new or changed request — the destination, never the route; update it only when your reading of their intent deepens or the user corrects direction; the goal outlives signal rewrites.",
		],
		parameters: GoalSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const result = state.set({ ...state.view(), goal: params });
			widget.update();
			return finish("set_goal", result);
		},
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("set_goal ")) + theme.fg("muted", args.title ?? ""), 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			return renderDetails(result, expanded, theme);
		},
	});

	pi.registerTool({
		name: "add_drift",
		label: "Add drift",
		description: "Report a mid-task course change as a drift, hoisted below the goal row.",
		promptSnippet: "Report a mid-task course change as drift the moment it happens.",
		promptGuidelines: [
			"You MUST add drift via `add_drift` the moment you change course or start working around a problem mid-task — for a mismatch with the declared plan. When it resolves, record any lasting conclusion as a decision or understanding and drop the drift in your next rewrite.",
		],
		parameters: AddDriftParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const view = state.view();
			const result = state.set({
				...view,
				nodes: [...view.nodes, { type: "drift", title: params.title, label: "detected" }],
			});
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
				`${theme.fg("accent", glyphCell("goal"))} ${theme.fg("text", details.goal.title)}${details.goal.label ? theme.fg("dim", ` ${details.goal.label}`) : ""}`,
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
		text += theme.fg("dim", ` · ${countNodes(details)} signals`);
	}
	return new Text(text, 0, 0);
}
