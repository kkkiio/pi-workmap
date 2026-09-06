/**
 * Node types and their semantics — the single source shared by the tool schema
 * (index.ts), validation (state.ts), and prompt guidelines.
 *
 * Types are cut by epistemic role: what the signal plays in the shared working
 * model (what we believe, what we have chosen, what we are doing, where we
 * have strayed). Every type must earn its place — each one costs glyph
 * vocabulary, color semantics, and classification accuracy (ADR 0003, ADR
 * 0005), so types whose routing practice never materializes get deleted rather
 * than tolerated.
 *
 * The goal is not a node type: it is the intent header, written through the
 * dedicated `set_goal` tool and rendered above the tree (ADR 0017). Mixing it
 * into the per-prompt signal rewrite turned it into a task restatement.
 */

export const WORKMAP_NODE_TYPES = [
	// A fact, synthesis, inference, or hypothesis the Agent currently uses.
	// Counterintuitive findings belong here precisely because they are easy to
	// lose; the label marks verification level — confirmed for
	// established ground, assumed for an unverified premise.
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
 * layering (ADR 0015) vocabulary is wording, never validation: it lives in
 * schema descriptions and guidelines, and is adjusted when it drifts. The
 * lists exist so guidelines and schema descriptions share one source.
 * understanding's ladder follows the model prior the session data exposed:
 * models mark verification level, confirmed >> everything else; inferred was deleted (zero organic uses — the trust judgment is binary: verified vs assumed).
 */
export const DECISION_LABELS = ["considering", "chosen"] as const;
export const UNDERSTANDING_LABELS = ["confirmed", "assumed"] as const;
export const TASK_LABELS = ["pending", "active", "done"] as const;

/**
 * Type invariants. Enforced where noted; otherwise taught in promptGuidelines.
 *
 * - Validation layering (ADR 0015): declaration-structure constraints (node
 *   enum, title 1–120, label ≤24, roots ≤8, children ≤4, depth 2) live in
 *   the set schema; the state layer only backstops the UI invariant (total
 *   nodes ≤10); everything semantic (label vocabulary, title conventions,
 * option placement) is wording and never enforced.
 * - Options live only under their decision (guideline).
 * - There is no `blocked` label. When work cannot proceed the Agent stops and
 *   asks in conversation; waiting for a user decision is `decision · considering`.
 */
