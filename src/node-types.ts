import { type Static, Type } from "typebox";

/** Signal roles; goal has its own schema and write channel. */
const TYPE_DESCRIPTIONS = {
	understanding:
		"A fact, synthesis, inference, or hypothesis the Agent currently uses; counterintuitive findings belong here",
	decision:
		"A choice being deliberated or already made; title it as a question while considering, and once decided append the conclusion (`Where should X live? → on the server`)",
	option: "A considered alternative under its parent decision",
	task: "An action the Agent intends or is doing",
	drift: "A mismatch with the declared plan",
} as const;

const literal = <T extends keyof typeof TYPE_DESCRIPTIONS>(name: T) =>
	Type.Literal(name, { description: TYPE_DESCRIPTIONS[name] });

/** Every signal type; an option is only legal beneath its decision. */
export const NodeTypeSchema = Type.Union([
	literal("understanding"),
	literal("decision"),
	literal("option"),
	literal("task"),
	literal("drift"),
]);

/** Roots hold the standing signals: an option belongs to a decision, never to the root. */
export const RootTypeSchema = Type.Union([
	literal("understanding"),
	literal("decision"),
	literal("task"),
	literal("drift"),
]);

export type WorkmapNodeType = Static<typeof NodeTypeSchema>;

const sharedFields = {
	title: Type.String({ description: "One scannable sentence", minLength: 1, maxLength: 120 }),
	label: Type.Optional(
		Type.String({
			description:
				"Optional short label. decision: considering/chosen; understanding: confirmed/ruled out; task: pending/active",
			maxLength: 24,
		}),
	),
};

export const ChildSchema = Type.Object({ type: NodeTypeSchema, ...sharedFields }, { additionalProperties: false });
export const RootSchema = Type.Object(
	{
		type: RootTypeSchema,
		...sharedFields,
		children: Type.Optional(Type.Array(ChildSchema, { description: "Supporting evidence, one level deep" })),
	},
	{ additionalProperties: false },
);

export const GoalSchema = Type.Object(
	{
		title: Type.String({ description: "The destination, one scannable sentence", minLength: 1, maxLength: 120 }),
		label: Type.Optional(Type.String({ description: "Optional short label, e.g. long-term", maxLength: 24 })),
	},
	{ additionalProperties: false },
);

export const WorkmapSchema = Type.Object(
	{
		goal: Type.Optional(GoalSchema),
		nodes: Type.Array(RootSchema),
	},
	{ additionalProperties: false },
);
