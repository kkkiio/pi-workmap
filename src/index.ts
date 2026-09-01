import { type ExtensionAPI, SessionManager } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type TSchema, Type } from "typebox";
import { renderStateMessage, renderTreeLines } from "./context-message.js";
import { MAX_WORKMAP_DEPTH, MAX_WORKMAP_NODES, WorkmapState } from "./state.js";
import {
	countNodes,
	type EvictedRoot,
	WORKMAP_NODE_TYPES,
	type WorkmapChild,
	type WorkmapRoot,
	type WorkmapToolDetails,
} from "./types.js";
import { glyphCell, PRESENTATION, WorkmapWidget } from "./widget.js";

const NodeTypeSchema = Type.Union(WORKMAP_NODE_TYPES.map((type) => Type.Literal(type)));
// Recursion is unrolled by depth: provider-facing tool schemas go out verbatim and
// cannot rely on $ref support, so children nest at most MAX_WORKMAP_DEPTH levels.
const signalFields = (children?: TSchema) => ({
	type: NodeTypeSchema,
	title: Type.String({ description: "One scannable sentence", minLength: 1, maxLength: 120 }),
	status: Type.Optional(Type.String({ description: "Optional restrained right-side label", maxLength: 24 })),
	...(children
		? {
				children: Type.Optional(
					Type.Array(children, {
						description: "Nested child signals. Children carry no ids and live or die with their tree",
						maxItems: 32,
					}),
				),
			}
		: {}),
});
const buildChildSchema = (depth: number): TSchema =>
	Type.Object(signalFields(depth > 1 ? buildChildSchema(depth - 1) : undefined), { additionalProperties: false });
const ChildSchema = buildChildSchema(MAX_WORKMAP_DEPTH - 1);
const RootSchema = Type.Object(
	{
		id: Type.String({
			description:
				"Stable, session-unique semantic snake_case id for the tree root, such as auth_race or server_idempotency",
			pattern: "^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$",
			maxLength: 64,
		}),
		...signalFields(ChildSchema),
	},
	{ additionalProperties: false },
);
const WorkmapParams = Type.Object(
	{
		action: Type.Union([Type.Literal("view"), Type.Literal("update"), Type.Literal("clear")]),
		nodes: Type.Optional(
			Type.Array(RootSchema, {
				description: "Complete trees to add or replace by root id. Upserting a root replaces its ENTIRE subtree",
				maxItems: MAX_WORKMAP_NODES,
			}),
		),
		remove: Type.Optional(
			Type.Array(Type.String(), { description: "Root ids whose trees to remove", maxItems: MAX_WORKMAP_NODES }),
		),
	},
	{ additionalProperties: false },
);

export default function workmapExtension(pi: ExtensionAPI): void {
	const state = new WorkmapState();
	const widget = new WorkmapWidget(() => state.list());
	let activeSessionId: string | undefined;
	// Agent turns (turn_end events) since the last workmap call, accumulated across runs;
	// rendered into the injected snapshot so the model can see the anchor going stale.
	let turnsSinceUpdate = 0;

	pi.on("session_start", async (event, ctx) => {
		turnsSinceUpdate = 0;
		const nextSessionId = ctx.sessionManager.getSessionId();
		if (event.reason === "new") {
			state.clear();
		} else if (event.reason === "fork" && event.previousSessionFile) {
			state.restore(SessionManager.open(event.previousSessionFile));
			state.persist(pi);
		} else {
			state.restore(ctx.sessionManager);
		}
		activeSessionId = nextSessionId;
		widget.attach(ctx.ui);
	});

	pi.on("session_tree", async (_event, ctx) => {
		// Branch navigation is not a new session and the map is session-global: keep the
		// staleness counter running so a stale map cannot masquerade as fresh.
		state.restore(ctx.sessionManager);
		widget.update();
	});

	pi.on("session_shutdown", async () => {
		widget.dispose();
	});

	pi.on("turn_end", async () => {
		turnsSinceUpdate += 1;
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		if (activeSessionId !== ctx.sessionManager.getSessionId()) {
			state.restore(ctx.sessionManager);
			activeSessionId = ctx.sessionManager.getSessionId();
			widget.attach(ctx.ui);
			turnsSinceUpdate = 0;
		}
		const nodes = state.list();
		if (nodes.length === 0) return {};
		// Re-inject on every run (ADR 0010): the snapshot carries the staleness counter, so
		// no two injections are identical, and the recurring tail position keeps the anchor
		// salient instead of letting it drift behind the growing transcript.
		return {
			message: {
				customType: "pi-workmap-context",
				content: renderStateMessage(nodes, { turnsSinceUpdate }),
				display: false,
			},
		};
	});

	pi.registerTool({
		name: "workmap",
		label: "Workmap",
		description:
			"Maintain your concise, user-visible working model for the current session. update upserts or removes whole trees by root id — upserting a root replaces its entire subtree. view inspects the map; clear drops it when the session workmap is no longer relevant.",
		promptSnippet:
			"Maintain the live workmap that lets the user inspect your current direction and follow your operational mental model.",
		promptGuidelines: [
			"You MUST have a heading before your first action after a user prompt — your best present reading of what the user wants, declared even at low confidence, because a corrected heading is a reward. Re-examine it at every phase shift and after every user correction: update it when your understanding changed, even if the user's words did not. A heading names the destination, never the route; routes are decisions. A heading takes status current or long-term.",
			"Use drift for a detected mismatch with the user's request or the declared plan. Remove it once the mismatch resolves through correction or completion of the affected work, recording any lasting conclusion as a decision or understanding first.",
			"Use decision for deliberation or commitments (title it as a question while deliberating, and once decided append the conclusion to the title, e.g. 'Where should X live? → on the server', keeping the question for context; status considering while open, chosen once settled), option only for considered decision alternatives.",
			"Use understanding for current facts/models/hypotheses (status hypothesis marks an unverified premise).",
			"Use task for current action (status active, done, or blocked; blocked means work cannot proceed without the user — stop and ask in conversation instead of only marking the map).",
			"You SHOULD update signals mid-loop as you learn; an update saved for the final reply is a postmortem, not a workmap.",
		],
		parameters: WorkmapParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			// Any call — including a no-change re-assertion — re-anchors the map.
			turnsSinceUpdate = 0;
			let changed = false;
			let error: string | undefined;
			let evicted: EvictedRoot[] = [];
			if (params.action === "clear") {
				changed = state.clear();
			} else if (params.action === "update") {
				if ((!params.nodes || params.nodes.length === 0) && (!params.remove || params.remove.length === 0)) {
					error = "update requires at least one tree or remove id";
				} else {
					({
						changed,
						error,
						evicted = [],
					} = state.update((params.nodes ?? []) as WorkmapRoot[], params.remove ?? [], Date.now()));
				}
			}
			if (changed) state.persist(pi);
			widget.update();
			const current = state.list();
			const total = countNodes(current);
			// Echo the resulting tree: the model must see the structure it just declared,
			// so an unintended flattening, a dropped subtree, or a capacity eviction is
			// visible next turn.
			const treeText = renderTreeLines(current).join("\n");
			const text = error
				? `Workmap update rejected: ${error}`
				: params.action === "view"
					? current.length
						? treeText
						: "Workmap is empty"
					: [
							`${changed ? "Updated" : "No change to"} workmap · ${total} signal${total === 1 ? "" : "s"}`,
							...(evicted.length > 0
								? [`Evicted over capacity: ${evicted.map((node) => `${node.id} (${node.title})`).join(", ")}`]
								: []),
							...(current.length > 0 ? [treeText] : []),
						].join("\n");
			const details: WorkmapToolDetails = {
				version: 3,
				action: params.action,
				nodes: current,
				changed,
				...(evicted.length > 0 ? { evicted } : {}),
				...(error ? { error } : {}),
			};
			return { content: [{ type: "text", text }], details, isError: Boolean(error) };
		},
		renderCall(args, theme) {
			const additions = args.nodes?.length ?? 0;
			const removals = args.remove?.length ?? 0;
			const suffix = args.action === "update" ? ` · ${additions} set${removals ? ` · ${removals} remove` : ""}` : "";
			return new Text(theme.fg("toolTitle", theme.bold("workmap ")) + theme.fg("muted", args.action + suffix), 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			const details = result.details as WorkmapToolDetails | undefined;
			if (!details) return new Text("", 0, 0);
			if (details.error) return new Text(theme.fg("error", details.error), 0, 0);
			let text = theme.fg("success", details.changed ? "Workmap updated" : "Workmap unchanged");
			if (details.evicted && details.evicted.length > 0) {
				text += `\n${theme.fg("dim", `Evicted over capacity: ${details.evicted.map((node) => `${node.id} (${node.title})`).join(", ")}`)}`;
			}
			if (expanded && details.nodes.length > 0) {
				const rows: string[] = [];
				const visit = (node: WorkmapChild, depth: number, id?: string): void => {
					const presentation = PRESENTATION[node.type];
					const indent = "  ".repeat(depth);
					const status = node.status ? theme.fg("dim", ` ${node.status}`) : "";
					const idText = id ? ` ${theme.fg("dim", id)}` : "";
					rows.push(
						`${indent}${theme.fg(presentation.glyphColor, glyphCell(node.type))} ${theme.fg("text", node.title)}${status}${idText}`,
					);
					for (const child of node.children ?? []) visit(child, depth + 1);
				};
				for (const root of details.nodes) visit(root, 0, root.id);
				text += `\n${rows.join("\n")}`;
			} else {
				text += theme.fg("dim", ` · ${countNodes(details.nodes)} signals`);
			}
			return new Text(text, 0, 0);
		},
	});
}
