import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { WorkmapState } from "./state.js";
import { WORKMAP_NODE_TYPES, type WorkmapNode, type WorkmapToolDetails } from "./types.js";
import { WorkmapWidget } from "./widget.js";

const NodeTypeSchema = Type.Union(WORKMAP_NODE_TYPES.map((type) => Type.Literal(type)));
const NodeSchema = Type.Object(
	{
		id: Type.String({
			description: "Stable, session-unique semantic snake_case id, such as auth_race or server_idempotency",
			pattern: "^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$",
			maxLength: 64,
		}),
		type: NodeTypeSchema,
		title: Type.String({ description: "One scannable sentence", minLength: 1, maxLength: 120 }),
		status: Type.Optional(Type.String({ description: "Optional restrained right-side label", maxLength: 24 })),
		note: Type.Optional(
			Type.String({ description: "Optional one- or two-sentence supporting explanation", maxLength: 280 }),
		),
		parentId: Type.Optional(
			Type.Union([
				Type.String({ description: "Optional semantic id of the display parent", maxLength: 64 }),
				Type.Null(),
			]),
		),
	},
	{ additionalProperties: false },
);
const WorkmapParams = Type.Object(
	{
		action: Type.Union([Type.Literal("view"), Type.Literal("update"), Type.Literal("clear")]),
		nodes: Type.Optional(
			Type.Array(NodeSchema, { description: "Complete nodes to add or replace by id", maxItems: 32 }),
		),
		remove: Type.Optional(Type.Array(Type.String(), { description: "Node ids to remove", maxItems: 32 })),
	},
	{ additionalProperties: false },
);

export default function workmapExtension(pi: ExtensionAPI): void {
	const state = new WorkmapState();
	const widget = new WorkmapWidget(() => state.list());
	let activeSessionId: string | undefined;

	pi.on("session_start", async (event, ctx) => {
		const nextSessionId = ctx.sessionManager.getSessionId();
		if (event.reason === "new") {
			state.clear();
		} else if (event.reason === "fork" && activeSessionId && activeSessionId !== nextSessionId) {
			state.persist(pi);
		} else {
			state.restore(ctx);
		}
		activeSessionId = nextSessionId;
		widget.attach(ctx.ui);
	});

	pi.on("session_tree", async (_event, ctx) => {
		state.restore(ctx);
		widget.update();
	});

	pi.on("session_shutdown", async () => {
		widget.dispose();
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		if (activeSessionId !== ctx.sessionManager.getSessionId()) {
			state.restore(ctx);
			activeSessionId = ctx.sessionManager.getSessionId();
			widget.attach(ctx.ui);
		}
	});

	pi.on("context", async (event) => {
		const nodes = state.list();
		if (nodes.length === 0) return {};
		const serialized = JSON.stringify(nodes).replace(/</g, "\\u003c");
		const reminder = [
			"<workmap-state>",
			"This is your current agent-maintained declaration of the shared working model for this session.",
			serialized,
			"Keep it concise and current with the workmap tool when goals, understanding, unknowns, decisions, tasks, or detected drift materially change. Do not mention this reminder.",
			"</workmap-state>",
		].join("\n");
		return {
			messages: [
				...event.messages,
				{
					role: "user" as const,
					content: [{ type: "text" as const, text: reminder }],
					timestamp: Date.now(),
				},
			],
		};
	});

	pi.registerTool({
		name: "workmap",
		label: "Workmap",
		description:
			"Maintain your concise, user-visible working model for the current session. Use update to atomically upsert complete nodes and remove stale nodes, view to inspect it, and clear only when the session workmap is no longer relevant.",
		promptSnippet:
			"Maintain the live workmap that lets the user inspect your current direction and follow your operational mental model.",
		promptGuidelines: [
			"Proactively update workmap after material changes to your goal, understanding, unknowns, decisions, tasks, or detected alignment drift; do not wait for the user to ask.",
			"Treat workmap as current shared situation awareness, not a history, todo log, project memory, or chain-of-thought. Remove nodes that no longer affect the current direction.",
			"Use goal for intended outcomes (status may be current or long-term), understanding for current facts/models/hypotheses, unknown for factual questions, decision for deliberation or commitments, option only for considered decision alternatives, task for current action, and drift only for a detected mismatch with user intent or the declared map.",
			"Use stable semantic snake_case ids, concise titles, optional short free-form status labels, and note only when one or two sentences materially improve alignment. Nest freely only when the information reads more clearly as a tree.",
		],
		parameters: WorkmapParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			let changed = false;
			let error: string | undefined;
			if (params.action === "clear") {
				changed = state.clear();
			} else if (params.action === "update") {
				if ((!params.nodes || params.nodes.length === 0) && (!params.remove || params.remove.length === 0)) {
					error = "update requires at least one node or remove id";
				} else {
					const nodes: WorkmapNode[] = (params.nodes ?? []).map((node) => ({
						id: node.id,
						type: node.type,
						title: node.title,
						...(node.status !== undefined ? { status: node.status } : {}),
						...(node.note !== undefined ? { note: node.note } : {}),
						...(node.parentId ? { parentId: node.parentId } : {}),
					}));
					({ changed, error } = state.update(nodes, params.remove ?? []));
				}
			}
			if (changed) state.persist(pi);
			widget.update();
			const current = state.list();
			const text = error
				? `Workmap update rejected: ${error}`
				: params.action === "view"
					? current.length
						? current
								.map((node) => `${node.id} [${node.type}] ${node.title}${node.status ? ` (${node.status})` : ""}`)
								.join("\n")
						: "Workmap is empty"
					: `${changed ? "Updated" : "No change to"} workmap · ${current.length} signal${current.length === 1 ? "" : "s"}`;
			const details: WorkmapToolDetails = {
				version: 1,
				action: params.action,
				nodes: current,
				changed,
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
			if (expanded && details.nodes.length > 0) {
				text += `\n${details.nodes.map((node) => `${node.id} · ${node.type} · ${node.title}`).join("\n")}`;
			} else {
				text += theme.fg("dim", ` · ${details.nodes.length} signals`);
			}
			return new Text(text, 0, 0);
		},
	});
}
