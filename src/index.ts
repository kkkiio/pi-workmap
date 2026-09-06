import { type ExtensionAPI, SessionManager } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { renderStateMessage, renderTreeLines } from "./context-message.js";
import { NODE_TYPE_DESCRIPTIONS, WORKMAP_NODE_TYPES } from "./node-types.js";
import { persistSnapshot } from "./session-entry.js";
import { WorkmapState } from "./state.js";
import { countNodes, type WorkmapChild, type WorkmapRoot, type WorkmapToolDetails } from "./types.js";
import { glyphCell, PRESENTATION, WorkmapWidget } from "./widget.js";

const NodeTypeSchema = Type.Union(
	WORKMAP_NODE_TYPES.map((type) => Type.Literal(type, { description: NODE_TYPE_DESCRIPTIONS[type] })),
);

const signalFields = {
	type: NodeTypeSchema,
	title: Type.String({ description: "One scannable sentence", minLength: 1, maxLength: 120 }),
	label: Type.Optional(
		Type.String({
			description:
				"Optional restrained right-side label. decision: considering/chosen; understanding: confirmed/assumed; task: pending/active/done",
			maxLength: 24,
		}),
	),
};

const ChildSchema = Type.Object({ ...signalFields }, { additionalProperties: false });

const RootSchema = Type.Object(
	{
		...signalFields,
		children: Type.Optional(
			Type.Array(ChildSchema, { description: "Supporting evidence, one level deep", maxItems: 4 }),
		),
	},
	{ additionalProperties: false },
);

const SetParams = Type.Object(
	{
		set: Type.Array(RootSchema, {
			description:
				"The COMPLETE signal tree, replacing everything. An empty array clears the signals; the goal is separate and managed by set_goal.",
			maxItems: 8,
		}),
	},
	{ additionalProperties: false },
);

const SetGoalParams = Type.Object(
	{
		title: Type.String({
			description: "The destination, one scannable sentence",
			minLength: 1,
			maxLength: 120,
		}),
		label: Type.Optional(
			Type.String({ description: "Optional restrained label, e.g. long-term for a standing direction", maxLength: 24 }),
		),
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
	// User prompts since the last workmap call. The MUST in the prompt guidelines
	// lowers forgetting but cannot eliminate it; this counter makes a stale map
	// visible to the model via the injected footer (escalated at >= 2).
	let promptsSinceRewrite = 0;

	pi.on("session_start", async (event, ctx) => {
		promptsSinceRewrite = 0;
		const nextSessionId = ctx.sessionManager.getSessionId();
		if (event.reason === "new") {
			state.clear();
		} else if (event.reason === "fork" && event.previousSessionFile) {
			state.restore(SessionManager.open(event.previousSessionFile));
			const view = state.view();
			persistSnapshot(pi, view.nodes, view.goal);
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
			promptsSinceRewrite = 0;
		}
		promptsSinceRewrite += 1;
		const view = state.view();
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
		const view = state.view();
		// Persist every accepted mutation; restore reads the newest snapshot.
		if (changed) persistSnapshot(pi, view.nodes, view.goal);
		const total = countNodes(view.nodes);
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
		name: "workmap",
		label: "Workmap",
		description:
			"Declare the COMPLETE signal map — your user-visible working model for the current session. Replaces everything: call it on every user prompt before your first action, passing the full tree; an empty array clears the signals. The goal is declared separately via set_goal; for a mid-task course change, use add_drift.",
		promptSnippet:
			"Maintain the live workmap that lets the user inspect your current direction and follow your operational mental model.",
		promptGuidelines: [
			"You MUST re-declare the complete signal map via the `workmap` tool before your first action after every user prompt; an empty array clears the signals.",
			"You MUST add drift via `add_drift` the moment you change course or start working around a problem mid-task — for a mismatch with the declared plan. When it resolves, record any lasting conclusion as a decision or understanding and drop the drift in your next rewrite.",
			'Use decision for deliberation or commitments — title a question while deliberating, and once decided append the conclusion ("Where should X live? → on the server"); use option only for considered alternatives under their decision.',
			"Use understanding for current facts, syntheses, and hypotheses; counterintuitive findings belong here precisely because they are easy to lose — label assumed until verified.",
			"Use task for actions you intend, are doing, or have done; a done title records side effects — what changed, what ran.",
		],
		parameters: SetParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			// Only an accepted declaration re-anchors the map: a rejected set changed
			// nothing, and resetting here would let repeated invalid calls suppress
			// the stale warning indefinitely.
			const result = state.set((params as { set: WorkmapRoot[] }).set);
			if (!result.error) promptsSinceRewrite = 0;
			widget.update();
			return finish("set", result);
		},
		renderCall(args, theme) {
			const additions = (args as { set?: unknown[] }).set?.length ?? 0;
			return new Text(theme.fg("toolTitle", theme.bold("workmap ")) + theme.fg("muted", `set · ${additions}`), 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			return renderDetails(result, expanded, theme);
		},
	});

	pi.registerTool({
		name: "set_goal",
		label: "Set goal",
		description:
			"Distill the user's ultimate want — the destination, never the route; renders as the map header and outlives signal rewrites. Call it when acting on a new or changed request, and when your reading of the intent deepens or the user corrects direction.",
		promptSnippet: "Distill the user's ultimate want into the goal header before acting on a new or changed request.",
		parameters: SetGoalParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			// A goal is not a rewrite: the stale counter keeps counting until a full
			// signal declaration re-anchors the map.
			const { title, label } = params as { title: string; label?: string };
			const result = state.setGoal(title, label);
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
		description:
			"Report a mid-task course change to the workmap: call it the moment you change approach or start working around a problem, and the drift is hoisted directly below the goal header. Works on an empty map. Rejected only when the map would exceed its 10-node capacity.",
		promptSnippet: "Report a mid-task course change as drift the moment it happens.",
		parameters: AddDriftParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			// A drift is an append, not a rewrite: the counter keeps counting until a
			// full workmap declaration re-anchors the map.
			const result = state.addDrift((params as { title: string }).title);
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
