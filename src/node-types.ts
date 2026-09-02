/**
 * Node types and their semantics — the single source shared by the tool schema
 * (index.ts), validation (state.ts), and prompt guidelines.
 *
 * Types are cut by epistemic role: what the signal plays in the shared working
 * model (where we are going, what we believe, what we have chosen, what we are
 * doing, where we have strayed). Every type must earn its place — each one
 * costs glyph vocabulary, color semantics, and classification accuracy
 * (ADR 0003, ADR 0005), so types whose routing practice never materializes get
 * deleted rather than tolerated.
 */

export const WORKMAP_NODE_TYPES = [
	// The Agent's best present reading of what the user wants — a falsifiable
	// paraphrase and the anchor every other signal is measured against. A
	// goal names the destination, never the route (routes are decisions).
	"goal",
	// A fact, synthesis, inference, or hypothesis the Agent currently uses.
	// Counterintuitive findings belong here precisely because they are easy to
	// lose; unverified premises are marked with the `hypothesis` status rather
	// than stated as fact.
	"understanding",
	// A choice being deliberated or already made. While deliberating the title
	// is a question; once decided the conclusion is appended ("…? → result"),
	// keeping the framing of the decision space visible.
	"decision",
	// A considered alternative under its parent decision. A tentative answer to
	// an open question is an `understanding · hypothesis`, not an option.
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
	goal: "The Agent's best present reading of what the user wants — the falsifiable anchor of the map",
	understanding: "A fact, synthesis, inference, or hypothesis the Agent currently uses",
	decision: "A choice being deliberated or already made; title it as a question while considering",
	option: "A considered alternative under its parent decision",
	task: "An action the Agent intends, is doing, or has done; done titles record side effects",
	drift: "A mismatch with the declared plan",
};

/**
 * Recommended status vocabulary per type. `status` itself stays a free-form
 * display annotation — no state machine (ADR 0003). The lists exist so
 * guidelines, schema descriptions, and any future validation share one source
 * and keep wording from drifting. An unlabeled goal reads as the current
 * focus; `long-term` optionally marks a standing project-level direction.
 */
export const DECISION_STATUSES = ["considering", "chosen"] as const;
export const UNDERSTANDING_STATUSES = ["observed", "inferred", "hypothesis"] as const;
export const TASK_STATUSES = ["pending", "active", "done"] as const;
export const OPTION_STATUSES = ["candidate"] as const;
export const DRIFT_STATUSES = ["detected"] as const;

/**
 * Type invariants. Enforced where noted; otherwise taught in promptGuidelines.
 *
 * - A non-empty map carries at least one goal (enforced in state.ts) — the
 *   anchor the rest of the map is read against; `set: []` — clearing — is
 *   exempt. The anchor is guaranteed by validation, not prompt discipline.
 * - Options live only under their decision (guideline).
 * - Factual questions get no node type: investigate directly, ask the user in
 *   conversation, or record a tentative answer as `understanding · hypothesis`.
 * - There is no `blocked` status. When work cannot proceed the Agent stops and
 *   asks in conversation; waiting for a user decision is `decision · considering`.
 */
