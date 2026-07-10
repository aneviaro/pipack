import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

interface AskUserQuestionOption {
	label: string;
	value?: string;
	description?: string;
}

interface AskUserQuestionParams {
	question: string;
	options?: AskUserQuestionOption[];
	allowFreeform?: boolean;
	recommendation?: string;
}

interface AskUserQuestionDetails {
	question: string;
	options: AskUserQuestionOption[];
	answer: string | null;
	value?: string;
	wasCustom: boolean;
	cancelled: boolean;
	recommendation?: string;
}

const OptionSchema = Type.Object({
	label: Type.String({ description: "Human-readable option label shown to the user" }),
	value: Type.Optional(Type.String({ description: "Stable value returned to the model when this option is selected" })),
	description: Type.Optional(Type.String({ description: "Optional short explanation shown next to the option" })),
});

const AskUserQuestionParamsSchema = Type.Object({
	question: Type.String({ description: "The concise question to ask the user" }),
	options: Type.Optional(Type.Array(OptionSchema, { description: "Optional multiple-choice answers" })),
	allowFreeform: Type.Optional(
		Type.Boolean({ description: "Whether the user may type a custom answer. Defaults to true." }),
	),
	recommendation: Type.Optional(
		Type.String({ description: "Recommended answer or default choice to help the user decide" }),
	),
});

function formatPrompt(params: AskUserQuestionParams): string {
	return params.recommendation ? `${params.question}\n\nRecommended: ${params.recommendation}` : params.question;
}

function formatOption(option: AskUserQuestionOption): string {
	return option.description ? `${option.label} — ${option.description}` : option.label;
}

function formatChoiceLabels(options: AskUserQuestionOption[]): string[] {
	return options.map((option, index) => `${index + 1}. ${formatOption(option)}`);
}

function normalizeFreeformAnswer(answer: string | undefined): string | null {
	if (answer === undefined) return null;
	return answer.trim() || "(no response)";
}

function resultContent(details: AskUserQuestionDetails): string {
	if (details.cancelled) return "User cancelled the question.";
	if (details.wasCustom) return `User answered: ${details.answer ?? ""}`;
	if (details.value && details.value !== details.answer) {
		return `User selected: ${details.answer} (${details.value})`;
	}
	return `User selected: ${details.answer ?? ""}`;
}

export default function askUserQuestion(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user_question",
		label: "Ask User Question",
		description:
			"Ask the user a blocking clarification question and return their answer. Use when progress requires a user decision that cannot be inferred from repository context.",
		promptSnippet: "Ask the user a blocking clarification question and return the answer.",
		promptGuidelines: [
			"Use ask_user_question only when a necessary user decision cannot be discovered from files, docs, or existing context.",
			"When using ask_user_question, ask one concise question, provide likely options when possible, and include a recommendation when there is a sensible default.",
		],
		parameters: AskUserQuestionParamsSchema,

		async execute(_toolCallId, params: AskUserQuestionParams, _signal, _onUpdate, ctx) {
			const options = params.options ?? [];
			const allowFreeform = params.allowFreeform !== false;

			if (options.length === 0 && !allowFreeform) {
				const details: AskUserQuestionDetails = {
					question: params.question,
					options,
					answer: null,
					wasCustom: false,
					cancelled: true,
					recommendation: params.recommendation,
				};
				return {
					content: [
						{
							type: "text" as const,
							text: "Error: cannot ask a question with no options and freeform disabled.",
						},
					],
					details,
				};
			}

			// Deliberately allow RPC mode: Pi documents dialog methods as available when ctx.hasUI is true.
			if (!ctx.hasUI) {
				const details: AskUserQuestionDetails = {
					question: params.question,
					options,
					answer: null,
					wasCustom: false,
					cancelled: true,
					recommendation: params.recommendation,
				};
				return { content: [{ type: "text" as const, text: "Error: UI is not available." }], details };
			}

			const prompt = formatPrompt(params);

			if (options.length === 0 || !allowFreeform) {
				if (options.length > 0) {
					const labels = formatChoiceLabels(options);
					const choice = await ctx.ui.select(prompt, labels);
					if (!choice) {
						const details: AskUserQuestionDetails = {
							question: params.question,
							options,
							answer: null,
							wasCustom: false,
							cancelled: true,
							recommendation: params.recommendation,
						};
						return { content: [{ type: "text" as const, text: resultContent(details) }], details };
					}

					const selectedIndex = labels.indexOf(choice);
					const selected = options[selectedIndex] ?? { label: choice };
					const details: AskUserQuestionDetails = {
						question: params.question,
						options,
						answer: selected.label,
						value: selected.value ?? selected.label,
						wasCustom: false,
						cancelled: false,
						recommendation: params.recommendation,
					};
					return { content: [{ type: "text" as const, text: resultContent(details) }], details };
				}

				const answer = normalizeFreeformAnswer(await ctx.ui.input(prompt, params.recommendation ?? "Type your answer..."));
				const cancelled = answer === null;
				const details: AskUserQuestionDetails = {
					question: params.question,
					options,
					answer,
					wasCustom: true,
					cancelled,
					recommendation: params.recommendation,
				};
				return { content: [{ type: "text" as const, text: resultContent(details) }], details };
			}

			const customLabel = `${options.length + 1}. Type a custom answer...`;
			const labels = [...formatChoiceLabels(options), customLabel];
			const choice = await ctx.ui.select(prompt, labels);

			if (!choice) {
				const details: AskUserQuestionDetails = {
					question: params.question,
					options,
					answer: null,
					wasCustom: false,
					cancelled: true,
					recommendation: params.recommendation,
				};
				return { content: [{ type: "text" as const, text: resultContent(details) }], details };
			}

			if (choice === customLabel) {
				const answer = normalizeFreeformAnswer(await ctx.ui.input(params.question, params.recommendation ?? "Type your answer..."));
				const cancelled = answer === null;
				const details: AskUserQuestionDetails = {
					question: params.question,
					options,
					answer,
					wasCustom: true,
					cancelled,
					recommendation: params.recommendation,
				};
				return { content: [{ type: "text" as const, text: resultContent(details) }], details };
			}

			const selectedIndex = labels.indexOf(choice);
			const selected = options[selectedIndex] ?? { label: choice };
			const details: AskUserQuestionDetails = {
				question: params.question,
				options,
				answer: selected.label,
				value: selected.value ?? selected.label,
				wasCustom: false,
				cancelled: false,
				recommendation: params.recommendation,
			};
			return { content: [{ type: "text" as const, text: resultContent(details) }], details };
		},

		renderCall(args: Partial<AskUserQuestionParams>, theme) {
			const question = typeof args.question === "string" ? args.question : "";
			const count = Array.isArray(args.options) ? args.options.length : 0;
			const suffix = count > 0 ? theme.fg("dim", ` (${count} option${count === 1 ? "" : "s"})`) : "";
			return new Text(theme.fg("toolTitle", theme.bold("ask_user_question ")) + theme.fg("muted", question) + suffix, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as AskUserQuestionDetails | undefined;
			if (!details) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}

			if (details.cancelled) return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			const prefix = details.wasCustom ? "answered" : "selected";
			return new Text(theme.fg("success", "✓ ") + theme.fg("muted", `${prefix}: `) + theme.fg("accent", details.answer ?? ""), 0, 0);
		},
	});
}
