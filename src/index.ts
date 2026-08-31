import { type ExtensionAPI, SessionManager } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { renderStateMessage } from "./context-message.js";
import { WorkmapState } from "./state.js";
import { WORKMAP_NODE_TYPES, type WorkmapNode, type WorkmapToolDetails } from "./types.js";
import { glyphCell, PRESENTATION, WorkmapWidget } from "./widget.js";

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
	let lastInjectedState: string | undefined;

	pi.on("session_start", async (event, ctx) => {
		lastInjectedState = undefined;
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
		lastInjectedState = undefined;
		state.restore(ctx.sessionManager);
		widget.update();
	});

	pi.on("session_shutdown", async () => {
		widget.dispose();
	});

	pi.on("session_before_compact", async () => {
		// Compaction may drop the injected message from context; allow re-injection on the next run.
		lastInjectedState = undefined;
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		if (activeSessionId !== ctx.sessionManager.getSessionId()) {
			state.restore(ctx.sessionManager);
			activeSessionId = ctx.sessionManager.getSessionId();
			widget.attach(ctx.ui);
			lastInjectedState = undefined;
		}
		const nodes = state.list();
		if (nodes.length === 0) return {};
		const fingerprint = JSON.stringify(nodes);
		if (fingerprint === lastInjectedState) return {};
		lastInjectedState = fingerprint;
		return {
			message: {
				customType: "pi-workmap-context",
				content: renderStateMessage(nodes),
				display: false,
			},
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
			"Proactively update workmap after material changes to your heading, understanding, decisions, tasks, or detected alignment drift; do not wait for the user to ask.",
			"Treat workmap as current shared situation awareness, not a history, todo log, project memory, or chain-of-thought. Remove nodes that no longer affect the current direction.",
			"Use heading to report your current course: your best present reading of what the user wants. Reporting a heading is telemetry, not testimony — a corrected heading is a success event, not an error, so declare it early even at low confidence. Re-examine it at every phase shift and after every user correction: update it when your understanding changed, even if the user's words did not. Heading names the destination, never the route; routes are decisions. Status may be current or long-term.",
			"Use understanding for current facts/models/hypotheses (mark any unverified premise explicitly as hypothesis rather than stating it as fact), decision for deliberation or commitments (title it as a question while deliberating, and once decided append the conclusion to the title, e.g. 'Where should X live? → on the server', keeping the question for context), option only for considered decision alternatives, task for current action (tasks may nest to express grouping, but keep nesting shallow and never model execution tracking such as dependencies or progress rollups), and drift only for a detected mismatch with user intent or the declared map. Keep a drift while the user has not responded; remove it once the mismatch resolves through correction or completion of the affected work, and when the user accepts the current direction, record any lasting conclusion as a decision or understanding before removing the drift.",
			"Investigate factual questions directly instead of recording them on the map. When only the user can answer, ask in conversation; when a pending answer blocks a decision, keep that decision at status considering with the open question in its note.",
			"Use stable semantic snake_case ids, concise titles, optional short free-form status labels, and note only when one or two sentences materially improve alignment. Nest freely only when the information reads more clearly as a tree.",
			"Prefer restrained conventional status labels such as current, long-term, open, investigating, considering, chosen, active, blocked, or done. Record blocked work as a task status with the reason in note or as its own decision node, and when work cannot proceed without the user, stop and ask in conversation instead of only marking the map.",
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
				const byId = new Map(details.nodes.map((node) => [node.id, node]));
				const depth = (node: WorkmapNode): number => {
					let level = 0;
					let parentId = node.parentId;
					while (parentId && level < 16) {
						const parent = byId.get(parentId);
						if (!parent) break;
						level += 1;
						parentId = parent.parentId;
					}
					return level;
				};
				const rows = details.nodes.map((node) => {
					const presentation = PRESENTATION[node.type];
					const indent = "  ".repeat(depth(node));
					const status = node.status ? theme.fg("dim", ` ${node.status}`) : "";
					return `${indent}${theme.fg(presentation.glyphColor, glyphCell(node.type))} ${theme.fg("text", node.title)}${status} ${theme.fg("dim", node.id)}`;
				});
				text += `\n${rows.join("\n")}`;
			} else {
				text += theme.fg("dim", ` · ${details.nodes.length} signals`);
			}
			return new Text(text, 0, 0);
		},
	});
}
