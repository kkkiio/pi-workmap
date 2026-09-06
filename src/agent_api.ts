import { Type } from "typebox";
import type { WorkmapChild, WorkmapGoal, WorkmapRoot } from "./types.js";

/**
 * The agent-facing API — everything the LLM reads: the tool schemas, the
 * wording layer (label vocabulary, tool descriptions, prompt guidelines), and
 * the injected state message. This file is the single review point for
 * context-facing text (AGENTS.md policy): wording changes are converged here
 * before they ship. Nothing in here executes product logic — the semantics
 * live in store.ts, the wiring in index.ts.
 *
 * The signal types are cut by epistemic role: what the node plays in the
 * shared working model (what we believe, what we have chosen, what we are
 * doing, where we have strayed). Every type must earn its place — each one
 * costs glyph vocabulary, color semantics, and classification accuracy (ADR
 * 0003, ADR 0005). The goal is a signal too — the intent header, rendered as
 * its own top row; it is absent from this enum only because its write channel
 * is the dedicated `set_goal` tool (ADR 0017): the three tools split the
 * signal family by write frequency, not by category.
 */

export const WORKMAP_NODE_TYPES = [
	// A fact, synthesis, inference, or hypothesis the Agent currently uses.
	// Counterintuitive findings belong here precisely because they are easy to
	// lose; the label marks verification level — confirmed for established
	// ground, assumed for an unverified premise.
	"understanding",
	// A choice being deliberated or already made. While deliberating the title
	// is a question; once decided the conclusion is appended ("…? → result"),
	// keeping the framing of the decision space visible.
	"decision",
	// A considered alternative under its parent decision. A tentative answer to
	// an open question is an understanding, not an option.
	"option",
	// An action the Agent declares it intends to do, is doing, or has done.
	// `done` titles record side effects (what changed, what ran): recent done
	// tasks are the map's behavior ledger, not an archive.
	"task",
	// A detected mismatch between the Agent's direction and user intent or the
	// current map — not a general risk and not a blocker. Removed once the
	// mismatch resolves, with any lasting conclusion recorded first.
	"drift",
] as const;

export type WorkmapNodeType = (typeof WORKMAP_NODE_TYPES)[number];

/** One scannable sentence per type, reused in schema descriptions. */
export const NODE_TYPE_DESCRIPTIONS: Record<WorkmapNodeType, string> = {
	understanding: "A fact, synthesis, inference, or hypothesis the Agent currently uses",
	decision: "A choice being deliberated or already made; title it as a question while considering",
	option: "A considered alternative under its parent decision",
	task: "An action the Agent intends, is doing, or has done; done titles record side effects",
	drift: "A mismatch with the declared plan",
};

/**
 * Recommended label vocabulary per type. `label` itself stays a free-form
 * display annotation — no state machine (ADR 0003), and per the validation
 * layering (ADR 0015) vocabulary is wording, never validation: it lives here
 * and in the schema descriptions, and is adjusted when it drifts. The lists
 * exist so this file is the single source. understanding's ladder follows the
 * model prior the session data exposed: models mark verification level,
 * confirmed >> everything else; inferred was deleted (zero organic uses — the
 * trust judgment is binary: verified vs assumed).
 */
export const DECISION_LABELS = ["considering", "chosen"] as const;
export const UNDERSTANDING_LABELS = ["confirmed", "assumed"] as const;
export const TASK_LABELS = ["pending", "active", "done"] as const;

/**
 * Validation layering (ADR 0015): the declaration shape below is declared once
 * here and enforced at the tool-call boundary by the provider-facing schema;
 * the state layer (store.ts) backstops the UI invariant (total signals ≤10)
 * and re-checks structure on the restore path with the compiled schema.
 * Everything semantic — label vocabulary, title conventions, option placement,
 * "prioritize the goal" — is wording and never enforced.
 */
export const NodeTypeSchema = Type.Union(
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

export const ChildSchema = Type.Object({ ...signalFields }, { additionalProperties: false });

export const RootSchema = Type.Object(
	{
		...signalFields,
		children: Type.Optional(
			Type.Array(ChildSchema, { description: "Supporting evidence, one level deep", maxItems: 4 }),
		),
	},
	{ additionalProperties: false },
);

export const SetParams = Type.Object(
	{
		set: Type.Array(RootSchema, {
			description:
				"The COMPLETE signal tree, replacing everything. An empty array clears the signals; the goal is separate and managed by set_goal.",
			maxItems: 8,
		}),
	},
	{ additionalProperties: false },
);

export const SetGoalParams = Type.Object(
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

export const AddDriftParams = Type.Object(
	{
		title: Type.String({ description: "The mismatch, one scannable sentence", minLength: 1, maxLength: 120 }),
	},
	{ additionalProperties: false },
);

/** Tool descriptions — payload semantics only; the cadence (when to call) lives in promptGuidelines. */
export const TOOL_DESCRIPTIONS = {
	// "restate" carries the write semantics: the map is a re-declaration view,
	// restated every prompt even when unchanged (ADR 0015); see ADR 0017 for the
	// rename rationale and the restate / set / add vocabulary.
	restate: "Restate the COMPLETE signal tree, replacing everything. An empty array clears the signals.",
	// "distill", not "guess" (ADR 0017).
	set_goal: "Distill the user's ultimate want — the destination, never the route. The goal outlives signal rewrites.",
	add_drift: "Report a mid-task course change as a drift, hoisted below the goal row.",
} as const;

export const PROMPT_GUIDELINES = [
	"You MUST restate the complete signal map before your first action after every user prompt; an empty array clears the signals.",
	"You MUST distill the user's ultimate want into the goal via `set_goal` before acting on a new or changed request — the destination, never the route; update it only when your reading of their intent deepens or the user corrects direction; the goal outlives signal rewrites.",
	"You MUST add drift via `add_drift` the moment you change course or start working around a problem mid-task — for a mismatch with the declared plan. When it resolves, record any lasting conclusion as a decision or understanding and drop the drift in your next rewrite.",
	'Use decision for deliberation or commitments — title a question while deliberating, and once decided append the conclusion ("Where should X live? → on the server"); use option only for considered alternatives under their decision.',
	"Use understanding for current facts, syntheses, and hypotheses; counterintuitive findings belong here precisely because they are easy to lose — label assumed until verified.",
	"Use task for actions you intend, are doing, or have done; a done title records side effects — what changed, what ran.",
];

export interface StateMessageMeta {
	/**
	 * User prompts since the last accepted full `restate` declaration —
	 * add_drift and set_goal append or distill but never re-anchor, so they do
	 * not reset this. The MUST in prompt guidelines lowers forgetting but
	 * cannot eliminate it; this counter makes a missed rewrite visible and
	 * escalates when it happens.
	 */
	promptsSinceRewrite: number;
}

/**
 * Display order for roots: drift leads (the goal row sits above the tree; the
 * user's first question after "is the direction right" is "where did we
 * stray"), the rest keeps insertion order.
 */
export function orderedRoots(roots: WorkmapRoot[]): WorkmapRoot[] {
	return [...roots.filter((root) => root.type === "drift"), ...roots.filter((root) => root.type !== "drift")];
}

/**
 * Render trees as a scannable indented listing. Notes and rationale stay out:
 * the model already knows its own reasoning, and durable context is
 * compaction's job.
 */
export function renderTreeLines(roots: WorkmapRoot[]): string[] {
	const ordered = orderedRoots(roots);
	const lines: string[] = [];
	const visit = (node: WorkmapChild, depth: number): void => {
		const label = node.label ? ` [${node.label}]` : "";
		lines.push(`${"  ".repeat(depth)}${node.type}${label}: ${node.title}`);
	};
	for (const root of ordered) {
		visit(root, 0);
		for (const child of root.children ?? []) visit(child, 1);
	}
	return lines;
}

/**
 * Render the workmap as the persisted context message, injected fresh on every
 * agent run. The goal row leads when present; the footer restates the two
 * writing surfaces, and escalates from routine reminder to pointed notice when
 * the map has gone stale.
 */
export function renderStateMessage(
	nodes: WorkmapRoot[],
	goal: WorkmapGoal | undefined,
	meta: StateMessageMeta,
): string {
	const stale = meta.promptsSinceRewrite >= 2;
	const footer = stale
		? `The workmap is ${meta.promptsSinceRewrite} user prompts stale — restate it before acting.`
		: "Restate this map on every user prompt; add_drift the moment you change course mid-task.";
	return [
		"<workmap-state>",
		...(goal ? ["", `goal${goal.label ? ` [${goal.label}]` : ""}: ${goal.title}`] : []),
		"",
		...renderTreeLines(nodes),
		"",
		footer,
		"</workmap-state>",
	].join("\n");
}
