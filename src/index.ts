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
	status: Type.Optional(Type.String({ description: "Optional restrained right-side label", maxLength: 24 })),
};

const ChildSchema = Type.Object({ ...signalFields }, { additionalProperties: false });

const RootSchema = Type.Object(
	{
		...signalFields,
		children: Type.Optional(Type.Array(ChildSchema, { description: "Supporting evidence, one level deep" })),
	},
	{ additionalProperties: false },
);

const SetParams = Type.Object(
	{
		set: Type.Array(RootSchema, {
			description: "The COMPLETE map, replacing everything. An empty array clears the map.",
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
	const widget = new WorkmapWidget(() => state.list());
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
			persistSnapshot(pi, state.list());
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
		const nodes = state.list();
		if (nodes.length === 0) return {};
		// Re-inject on every run (ADR 0010): the recurring tail position keeps the
		// anchor salient, and the footer escalates when the map goes stale.
		return {
			message: {
				customType: "pi-workmap-context",
				content: renderStateMessage(nodes, { promptsSinceRewrite }),
				display: false,
			},
		};
	});

	const finish = (
		action: WorkmapToolDetails["action"],
		result: { changed: boolean; error?: string },
	): { content: { type: "text"; text: string }[]; details: WorkmapToolDetails; isError: boolean } => {
		const { changed, error } = result;
		const current = state.list();
		// Persist every accepted mutation; restore reads the newest snapshot.
		if (changed) persistSnapshot(pi, current);
		const total = countNodes(current);
		// Echo the resulting tree: the model must see the structure it just declared,
		// so an unintended flattening, a dropped subtree, or a miscount is visible
		// next turn.
		const treeText = renderTreeLines(current).join("\n");
		const text = error
			? `Workmap update rejected: ${error}`
			: `${changed ? "Updated" : "No change to"} workmap · ${total} signal${total === 1 ? "" : "s"}${
					current.length > 0 ? `\n${treeText}` : ""
				}`;
		const details: WorkmapToolDetails = { version: 4, action, changed, ...(error ? { error } : {}), nodes: current };
		return { content: [{ type: "text", text }], details, isError: Boolean(error) };
	};

	pi.registerTool({
		name: "workmap",
		label: "Workmap",
		description:
			"Declare the COMPLETE workmap — your user-visible working model for the current session. Replaces everything: call it on every user prompt before your first action, passing the full map; an empty array clears the map. For a mid-task course change, use add_drift instead.",
		promptSnippet:
			"Maintain the live workmap that lets the user inspect your current direction and follow your operational mental model.",
		promptGuidelines: [
			"You MUST re-declare the complete map via the `workmap` tool before your first action after every user prompt.",
			"You MUST add drift via `add_drift` the moment you change course or start working around a problem mid-task — for a mismatch with the declared plan. When the mismatch resolves, record any lasting conclusion as a decision or understanding, then drop the drift in your next rewrite.",
			"Use heading for the destination, never the route; routes are decisions. status current for where the user just pointed, long-term for the project-level direction this session serves.",
			"Use decision for deliberation or commitments: title it as a question while deliberating, and once decided append the conclusion, e.g. 'Where should X live? → on the server', keeping the question for context; status considering while open, chosen once settled.",
			"Use option only for considered alternatives under their decision.",
			"Use understanding for current facts, syntheses, and hypotheses; status hypothesis marks an unverified premise. Counterintuitive findings belong here precisely because they are easy to lose.",
			"Use task for actions you intend, are doing, or have done; status pending, active, or done. A done title records side effects — what changed, what ran.",
		],
		parameters: SetParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			// Any call — including a no-change re-assertion — re-anchors the map.
			promptsSinceRewrite = 0;
			const result = state.set((params as { set: WorkmapRoot[] }).set);
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
		name: "add_drift",
		label: "Add drift",
		description:
			"Report a mid-task course change to the workmap: call it the moment you change approach or start working around a problem, appending a drift signal. Rejected on an empty map or when the map is at its 10-node capacity.",
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
	if (expanded && details.nodes.length > 0) {
		const rows: string[] = [];
		const render = (node: WorkmapChild, depth: number): void => {
			const presentation = PRESENTATION[node.type];
			const indent = "  ".repeat(depth);
			const status = node.status ? theme.fg("dim", ` ${node.status}`) : "";
			rows.push(
				`${indent}${theme.fg(presentation.glyphColor, glyphCell(node.type))} ${theme.fg("text", node.title)}${status}`,
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
