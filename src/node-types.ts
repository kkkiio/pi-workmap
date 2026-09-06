import { type Static, Type } from "typebox";

/** Signal roles; goal has its own schema and write channel. */
export const NodeTypeSchema = Type.Union([
	Type.Literal("understanding", {
		description: "A fact, synthesis, inference, or hypothesis the Agent currently uses",
	}),
	Type.Literal("decision", {
		description: "A choice being deliberated or already made; title it as a question while considering",
	}),
	Type.Literal("option", { description: "A considered alternative under its parent decision" }),
	Type.Literal("task", {
		description: "An action the Agent intends, is doing, or has done; done titles record side effects",
	}),
	Type.Literal("drift", { description: "A mismatch with the declared plan" }),
]);
export type WorkmapNodeType = Static<typeof NodeTypeSchema>;

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

export const ChildSchema = Type.Object(signalFields, { additionalProperties: false });
export const RootSchema = Type.Object(
	{
		...signalFields,
		children: Type.Optional(Type.Array(ChildSchema, { description: "Supporting evidence, one level deep" })),
	},
	{ additionalProperties: false },
);

export const GoalSchema = Type.Object(
	{
		title: Type.String({ description: "The destination, one scannable sentence", minLength: 1, maxLength: 120 }),
		label: Type.Optional(
			Type.String({ description: "Optional restrained label, e.g. long-term for a standing direction", maxLength: 24 }),
		),
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
