import { createHash, randomUUID } from "node:crypto";
import { promises as fs, type Stats } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "typebox";

type ToolTextContent = { type: "text"; text: string };
type ToolResult = { content: ToolTextContent[]; details?: Record<string, unknown> };
type ToolCallEventResult = { block: true; reason?: string } | void;

interface ToolDefinition {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: unknown;
	execute(
		toolCallId: string,
		params: ValidateRmParams,
		signal: AbortSignal | undefined,
		onUpdate: unknown,
		ctx: ExtensionContext,
	): Promise<ToolResult> | ToolResult;
}

interface ToolCallEvent {
	toolName: string;
	input: Record<string, unknown>;
}

interface BashToolCallEvent extends ToolCallEvent {
	input: { command?: unknown };
}

interface ExtensionAPI {
	registerTool(definition: ToolDefinition): void;
	on(event: "session_shutdown", handler: () => void): void;
	on(event: "tool_call", handler: (event: ToolCallEvent, ctx: ExtensionContext) => Promise<ToolCallEventResult> | ToolCallEventResult): void;
}

interface ExtensionContext {
	cwd: string;
	sessionManager?: unknown;
	signal?: AbortSignal;
}

function isBashToolCallEvent(event: ToolCallEvent): event is BashToolCallEvent {
	return event.toolName === "bash";
}

export const APPROVAL_TTL_MS = 5 * 60 * 1000;
export const ENTRY_LIMIT = 10_000;
export const SAMPLE_LIMIT = 100;

export const VALIDATE_RM_STATES = [
	"validated",
	"unknown_request",
	"expired",
	"already_consumed",
	"cross_session",
	"dynamic_target",
	"protected_target",
	"unsupported_syntax",
	"too_many_entries",
	"filesystem_error",
	"cancelled",
	"no_matching_targets",
] as const;

export type ValidationState = (typeof VALIDATE_RM_STATES)[number];

export interface ValidateRmParams {
	requestId: string;
}

interface Token {
	text: string;
	raw: string;
	start: number;
	end: number;
	hasDynamic: boolean;
	hasGlob: boolean;
	hasBrace: boolean;
	hasExtglob: boolean;
	quoted: boolean;
	type: "word" | "op";
}

interface CommandSegment {
	tokens: Token[];
	start: number;
	end: number;
}

export interface ParsedOperand {
	text: string;
	raw: string;
	start: number;
	end: number;
	isGlob: boolean;
	hasDynamic: boolean;
	hasBrace: boolean;
	hasExtglob: boolean;
}

export interface ParsedRmInvocation {
	id: number;
	commandStart: number;
	commandEnd: number;
	rmTokenStart: number;
	rmTokenEnd: number;
	operandReplaceStart: number;
	operandReplaceEnd: number;
	operands: ParsedOperand[];
	nested: boolean;
}

export interface CommandAnalysis {
	status: "ok" | "dynamic_target" | "unsupported_syntax";
	message?: string;
	invocations: ParsedRmInvocation[];
}

export interface SnapshotInvocation {
	invocationId: number;
	roots: string[];
	missingOperands: string[];
	unmatchedPatterns: string[];
}

export interface DeletionSnapshot {
	roots: string[];
	missingOperands: string[];
	unmatchedPatterns: string[];
	counts: {
		total: number;
		files: number;
		directories: number;
		symlinks: number;
		other: number;
	};
	apparentBytes: number;
	sample: string[];
	omittedFromSample: number;
	fingerprint: string;
	invocations: SnapshotInvocation[];
}

export interface PendingRmValidation {
	requestId: string;
	sessionKey: string;
	command: string;
	cwd: string;
	createdAt: number;
	parsedInvocations: ParsedRmInvocation[];
	analysisStatus: CommandAnalysis["status"];
	analysisMessage?: string;
	snapshot?: DeletionSnapshot;
	validatedAt?: number;
	expiresAt?: number;
	consumed: boolean;
}

interface ValidationResult {
	state: ValidationState;
	text: string;
	details: Record<string, unknown>;
	snapshot?: DeletionSnapshot;
}

interface EntryRecord {
	absolutePath: string;
	type: FileType;
	size: number;
}

type FileType = "file" | "directory" | "symlink" | "other";

class RmValidationError extends Error {
	constructor(
		readonly state: Exclude<ValidationState, "validated" | "unknown_request" | "expired" | "already_consumed" | "cross_session" | "no_matching_targets">,
		message: string,
		readonly details: Record<string, unknown> = {},
	) {
		super(message);
	}
}

function isWhitespace(char: string): boolean {
	return char === " " || char === "\t" || char === "\r" || char === "\n";
}

function isOperatorStart(input: string, index: number): string | undefined {
	const two = input.slice(index, index + 2);
	if (two === "&&" || two === "||" || two === ";;" || two === "|&") return two;
	const one = input[index];
	return one === ";" || one === "|" || one === "(" || one === ")" || one === "\n" ? one : undefined;
}

export function shellQuote(value: string): string {
	if (value.length === 0) return "''";
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function escapePath(value: string): string {
	return JSON.stringify(value);
}

interface WordScanState {
	index: number;
	text: string;
	raw: string;
	hasDynamic: boolean;
	hasGlob: boolean;
	hasBrace: boolean;
	hasExtglob: boolean;
	quoted: boolean;
	lastUnquoted: string;
}

function scanSingleQuoted(input: string, state: WordScanState): "continue" | "unterminated" {
	state.quoted = true;
	state.raw += input[state.index];
	state.index += 1;
	while (state.index < input.length && input[state.index] !== "'") {
		state.text += input[state.index];
		state.raw += input[state.index];
		state.index += 1;
	}
	if (state.index >= input.length) return "unterminated";
	state.raw += input[state.index];
	state.index += 1;
	state.lastUnquoted = "";
	return "continue";
}

function scanDoubleQuoted(input: string, state: WordScanState): "continue" | "unterminated" {
	state.quoted = true;
	state.raw += input[state.index];
	state.index += 1;
	while (state.index < input.length && input[state.index] !== '"') {
		const inner = input[state.index];
		if (inner === "\\" && state.index + 1 < input.length) {
			state.raw += inner + input[state.index + 1];
			state.text += input[state.index + 1];
			state.index += 2;
			continue;
		}
		if (inner === "$" || inner === "`") state.hasDynamic = true;
		state.text += inner;
		state.raw += inner;
		state.index += 1;
	}
	if (state.index >= input.length) return "unterminated";
	state.raw += input[state.index];
	state.index += 1;
	state.lastUnquoted = "";
	return "continue";
}

function scanEscaped(input: string, state: WordScanState): boolean {
	if (input[state.index] !== "\\" || state.index + 1 >= input.length) return false;
	state.raw += input[state.index] + input[state.index + 1];
	state.text += input[state.index + 1];
	state.index += 2;
	state.lastUnquoted = input[state.index - 1];
	return true;
}

function scanUnquoted(input: string, state: WordScanState): void {
	const current = input[state.index];
	if (current === "$" || current === "`") state.hasDynamic = true;
	if (current === "<" && input[state.index + 1] === "(") state.hasDynamic = true;
	if (current === "*" || current === "?" || current === "[") state.hasGlob = true;
	if (current === "{" || current === "}") state.hasBrace = true;
	if (current === "(" && ["@", "!", "+", "?", "*"].includes(state.lastUnquoted)) state.hasExtglob = true;
	state.text += current;
	state.raw += current;
	state.lastUnquoted = current;
	state.index += 1;
}

function scanWord(input: string, start: number): Token {
	const state: WordScanState = {
		index: start,
		text: "",
		raw: "",
		hasDynamic: false,
		hasGlob: false,
		hasBrace: false,
		hasExtglob: false,
		quoted: false,
		lastUnquoted: "",
	};
	while (state.index < input.length) {
		const current = input[state.index];
		if (isWhitespace(current) || isOperatorStart(input, state.index)) break;
		if (current === "'") {
			if (scanSingleQuoted(input, state) === "unterminated") {
				state.hasDynamic = true;
				break;
			}
			continue;
		}
		if (current === '"') {
			if (scanDoubleQuoted(input, state) === "unterminated") {
				state.hasDynamic = true;
				break;
			}
			continue;
		}
		if (scanEscaped(input, state)) continue;
		scanUnquoted(input, state);
	}
	return { text: state.text, raw: state.raw, start, end: state.index, hasDynamic: state.hasDynamic, hasGlob: state.hasGlob, hasBrace: state.hasBrace, hasExtglob: state.hasExtglob, quoted: state.quoted, type: "word" };
}

function operatorToken(text: string, start: number): Token {
	return { text, raw: text, start, end: start + text.length, hasDynamic: false, hasGlob: false, hasBrace: false, hasExtglob: false, quoted: false, type: "op" };
}

function tokenizeShell(input: string): Token[] {
	const tokens: Token[] = [];
	let index = 0;
	let atWordBoundary = true;

	while (index < input.length) {
		const char = input[index];
		if (isWhitespace(char)) {
			atWordBoundary = true;
			index += 1;
			continue;
		}
		if (char === "#" && atWordBoundary) {
			while (index < input.length && input[index] !== "\n") index += 1;
			continue;
		}
		const op = isOperatorStart(input, index);
		if (op) {
			tokens.push(operatorToken(op, index));
			index += op.length;
			atWordBoundary = true;
			continue;
		}

		const word = scanWord(input, index);
		tokens.push(word);
		index = word.end;
		atWordBoundary = false;
	}
	return tokens;
}

function splitSegments(tokens: Token[]): CommandSegment[] {
	const segments: CommandSegment[] = [];
	let current: Token[] = [];
	const flush = () => {
		if (current.length > 0) {
			segments.push({ tokens: current, start: current[0].start, end: current[current.length - 1].end });
			current = [];
		}
	};
	for (const token of tokens) {
		if (token.type === "op") {
			flush();
			continue;
		}
		current.push(token);
	}
	flush();
	return segments;
}

function basenameCommand(command: string): string {
	return path.posix.basename(command.replace(/\\/g, "/"));
}

function isRmCommand(command: string): boolean {
	return basenameCommand(command) === "rm";
}

function isAssignment(text: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*=/.test(text);
}

function commandIndexAfterWrappers(tokens: Token[]): number | undefined {
	let index = 0;
	while (index < tokens.length && isAssignment(tokens[index].text)) index += 1;
	while (index < tokens.length) {
		const name = basenameCommand(tokens[index].text);
		if (name === "command") {
			index += 1;
			while (index < tokens.length && /^-[A-Za-z]+$/.test(tokens[index].text)) index += 1;
			continue;
		}
		if (name === "sudo") {
			index += 1;
			while (index < tokens.length && tokens[index].text.startsWith("-") && tokens[index].text !== "--") index += 1;
			if (tokens[index]?.text === "--") index += 1;
			continue;
		}
		if (name === "env") {
			index += 1;
			while (index < tokens.length) {
				if (isAssignment(tokens[index].text)) {
					index += 1;
					continue;
				}
				if (tokens[index].text === "--") {
					index += 1;
					continue;
				}
				if (tokens[index].text.startsWith("-") && tokens[index].text !== "-") {
					index += 1;
					continue;
				}
				break;
			}
			continue;
		}
		break;
	}
	return index < tokens.length ? index : undefined;
}

function parseRmInvocation(tokens: Token[], commandIndex: number, id: number, nested: boolean): ParsedRmInvocation | undefined {
	let recursive = false;
	let force = false;
	let parsingOptions = true;
	let optionEnd = tokens[commandIndex].end;
	const operands: ParsedOperand[] = [];
	for (let index = commandIndex + 1; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (parsingOptions && token.text === "--") {
			parsingOptions = false;
			optionEnd = token.start;
			continue;
		}
		if (parsingOptions && token.text.startsWith("--") && token.text.length > 2) {
			if (token.text === "--recursive") recursive = true;
			if (token.text === "--force") force = true;
			optionEnd = token.end;
			continue;
		}
		if (parsingOptions && /^-[^-].*/.test(token.text)) {
			for (const char of token.text.slice(1)) {
				if (char === "r" || char === "R") recursive = true;
				if (char === "f") force = true;
			}
			optionEnd = token.end;
			continue;
		}
		parsingOptions = false;
		operands.push({
			text: token.text,
			raw: token.raw,
			start: token.start,
			end: token.end,
			isGlob: token.hasGlob,
			hasDynamic: token.hasDynamic,
			hasBrace: token.hasBrace,
			hasExtglob: token.hasExtglob,
		});
	}
	if (!recursive || !force) return undefined;
	return {
		id,
		commandStart: tokens[0].start,
		commandEnd: tokens[tokens.length - 1].end,
		rmTokenStart: tokens[commandIndex].start,
		rmTokenEnd: tokens[commandIndex].end,
		operandReplaceStart: operands[0]?.start ?? optionEnd,
		operandReplaceEnd: operands[operands.length - 1]?.end ?? optionEnd,
		operands,
		nested,
	};
}

function segmentHasGuardedRmAfter(tokens: Token[], startIndex: number): boolean {
	for (let index = startIndex; index < tokens.length; index += 1) {
		if (!isRmCommand(tokens[index].text)) continue;
		if (parseRmInvocation(tokens.slice(index), 0, 0, false)) return true;
	}
	return false;
}

export function analyzeCommand(command: string, options: { nested?: boolean } = {}): CommandAnalysis {
	const tokens = tokenizeShell(command);
	const invocations: ParsedRmInvocation[] = [];
	let nextId = 1;
	for (const segment of splitSegments(tokens)) {
		if (segment.tokens.length === 0) continue;
		const firstName = basenameCommand(segment.tokens[0].text);
		if (firstName === "eval") return { status: "dynamic_target", message: "eval can generate rm operands at runtime", invocations };
		if (firstName === "xargs" && segmentHasGuardedRmAfter(segment.tokens, 1)) {
			return { status: "dynamic_target", message: "xargs supplies rm operands at runtime", invocations };
		}
		if (firstName === "find") {
			for (let i = 1; i < segment.tokens.length; i += 1) {
				if (segment.tokens[i].text === "-exec" && segmentHasGuardedRmAfter(segment.tokens, i + 1)) {
					return { status: "dynamic_target", message: "find -exec supplies rm operands at runtime", invocations };
				}
			}
		}
		if ((firstName === "sh" || firstName === "bash" || firstName === "dash" || firstName === "zsh") && segment.tokens.some((token) => token.text === "-c")) {
			const cIndex = segment.tokens.findIndex((token) => token.text === "-c");
			const script = segment.tokens[cIndex + 1];
			if (!script || script.hasDynamic) return { status: "dynamic_target", message: "nested shell program is dynamic", invocations };
			const nested = analyzeCommand(script.text, { nested: true });
			if (nested.status !== "ok") return nested;
			if (nested.invocations.length > 0) return { status: "unsupported_syntax", message: "static nested shell rm is detected but cannot be safely rewritten in this version", invocations: nested.invocations };
		}
		const commandIndex = commandIndexAfterWrappers(segment.tokens);
		if (commandIndex === undefined) continue;
		if (!isRmCommand(segment.tokens[commandIndex].text)) continue;
		const invocation = parseRmInvocation(segment.tokens, commandIndex, nextId, Boolean(options.nested));
		if (invocation) {
			invocations.push(invocation);
			nextId += 1;
		}
	}
	return { status: "ok", invocations };
}

function fileTypeFromStats(stats: Stats): FileType {
	if (stats.isFile()) return "file";
	if (stats.isDirectory()) return "directory";
	if (stats.isSymbolicLink()) return "symlink";
	return "other";
}

function normalizeAbsolute(cwd: string, target: string): string {
	return path.resolve(cwd, target);
}

function isSameOrAncestor(maybeAncestor: string, child: string): boolean {
	const a = path.resolve(maybeAncestor);
	const c = path.resolve(child);
	return a === c || c.startsWith(a.endsWith(path.sep) ? a : `${a}${path.sep}`);
}

function assertNotProtected(target: string, cwd: string): void {
	const normalized = path.resolve(target);
	const normalizedCwd = path.resolve(cwd);
	const home = path.resolve(os.homedir());
	if (normalized === path.parse(normalized).root) {
		throw new RmValidationError("protected_target", `Protected target denied: ${normalized}`, { target: normalized, reason: "filesystem_root" });
	}
	if (normalized === home) {
		throw new RmValidationError("protected_target", `Protected target denied: ${normalized}`, { target: normalized, reason: "home_directory" });
	}
	if (isSameOrAncestor(normalized, normalizedCwd)) {
		throw new RmValidationError("protected_target", `Protected target denied: ${normalized}`, { target: normalized, reason: normalized === normalizedCwd ? "working_directory" : "working_directory_ancestor" });
	}
}

function globSegmentToRegExp(pattern: string): RegExp {
	let source = "^";
	for (let i = 0; i < pattern.length; i += 1) {
		const char = pattern[i];
		if (char === "*") {
			source += "[^/]*";
			continue;
		}
		if (char === "?") {
			source += "[^/]";
			continue;
		}
		if (char === "[") {
			let j = i + 1;
			let bracket = "";
			if (pattern[j] === "!" || pattern[j] === "^") {
				bracket += "^";
				j += 1;
			}
			while (j < pattern.length && pattern[j] !== "]") {
				bracket += pattern[j].replace(/[\\\]]/g, "\\$&");
				j += 1;
			}
			if (j < pattern.length && bracket.length > 0) {
				source += `[${bracket}]`;
				i = j;
				continue;
			}
		}
		source += char.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
	}
	source += "$";
	return new RegExp(source);
}

async function expandGlob(cwd: string, patternText: string): Promise<string[]> {
	const absolutePattern = path.isAbsolute(patternText) ? path.normalize(patternText) : path.resolve(cwd, patternText);
	const parsed = path.parse(absolutePattern);
	const relative = path.relative(parsed.root, absolutePattern);
	const segments = relative.split(path.sep).filter(Boolean);
	let current = [parsed.root];
	for (const segment of segments) {
		const hasMagic = /[*?[]/.test(segment);
		const next: string[] = [];
		if (!hasMagic) {
			for (const base of current) next.push(path.join(base, segment));
			current = next;
			continue;
		}
		const regex = globSegmentToRegExp(segment);
		const dotAllowed = segment.startsWith(".");
		for (const base of current) {
			let entries: string[];
			try {
				entries = await fs.readdir(base);
			} catch (error: any) {
				if (error?.code === "ENOENT" || error?.code === "ENOTDIR") continue;
				throw new RmValidationError("filesystem_error", `Unable to read directory ${escapePath(base)}: ${error?.message ?? String(error)}`, { path: base });
			}
			for (const entry of entries) {
				if (!dotAllowed && entry.startsWith(".")) continue;
				if (regex.test(entry)) next.push(path.join(base, entry));
			}
		}
		current = next;
	}
	return [...new Set(current.map((value) => path.resolve(value)))].sort();
}

async function lstatMaybe(absolutePath: string): Promise<Stats | undefined> {
	try {
		return await fs.lstat(absolutePath);
	} catch (error: any) {
		if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return undefined;
		throw new RmValidationError("filesystem_error", `Unable to inspect ${escapePath(absolutePath)}: ${error?.message ?? String(error)}`, { path: absolutePath });
	}
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw new RmValidationError("cancelled", "Validation was cancelled");
}

export function tooManyEntriesMessage(discoveredEntries: number): string {
	return [
		`Hard cap is ${ENTRY_LIMIT.toLocaleString()} entries; at least ${discoveredEntries.toLocaleString()} entries were discovered.`,
		"No approval was created and no files were deleted.",
		"This command cannot be authorized or executed.",
		"Do not split the same directory tree into child deletion commands or manual batches.",
	].join(" ");
}

function tooManyEntriesError(discoveredEntries: number): RmValidationError {
	return new RmValidationError("too_many_entries", tooManyEntriesMessage(discoveredEntries), {
		limit: ENTRY_LIMIT,
		discoveredEntries,
		hardCap: true,
		canAuthorize: false,
	});
}

async function collectEntries(root: string, entries: EntryRecord[], signal?: AbortSignal): Promise<void> {
	throwIfAborted(signal);
	if (entries.length > ENTRY_LIMIT) throw tooManyEntriesError(entries.length);
	const stats = await lstatMaybe(root);
	if (!stats) return;
	const type = fileTypeFromStats(stats);
	entries.push({ absolutePath: root, type, size: type === "file" ? stats.size : 0 });
	if (entries.length > ENTRY_LIMIT) throw tooManyEntriesError(entries.length);
	if (type !== "directory") return;
	let children: string[];
	try {
		children = await fs.readdir(root);
	} catch (error: any) {
		throw new RmValidationError("filesystem_error", `Unable to read directory ${escapePath(root)}: ${error?.message ?? String(error)}`, { path: root });
	}
	children.sort();
	for (const child of children) {
		await collectEntries(path.join(root, child), entries, signal);
	}
}

async function resolveInvocationRoots(cwd: string, invocation: ParsedRmInvocation): Promise<SnapshotInvocation> {
	const roots: string[] = [];
	const missingOperands: string[] = [];
	const unmatchedPatterns: string[] = [];
	for (const operand of invocation.operands) {
		if (operand.hasDynamic) throw new RmValidationError("dynamic_target", `Dynamic rm target rejected: ${operand.raw}`, { operand: operand.raw });
		if (operand.hasBrace || operand.hasExtglob) throw new RmValidationError("unsupported_syntax", `Unsupported rm target syntax rejected: ${operand.raw}`, { operand: operand.raw });
		if (operand.isGlob) {
			const matches = await expandGlob(cwd, operand.text);
			if (matches.length === 0) {
				unmatchedPatterns.push(operand.text);
				continue;
			}
			for (const match of matches) {
				assertNotProtected(match, cwd);
				roots.push(match);
			}
			continue;
		}
		const absolute = normalizeAbsolute(cwd, operand.text);
		assertNotProtected(absolute, cwd);
		const stats = await lstatMaybe(absolute);
		if (!stats) {
			missingOperands.push(absolute);
			continue;
		}
		roots.push(absolute);
	}
	return {
		invocationId: invocation.id,
		roots: [...new Set(roots)].sort(),
		missingOperands: [...new Set(missingOperands)].sort(),
		unmatchedPatterns: [...new Set(unmatchedPatterns)].sort(),
	};
}

function makeSample(paths: string[], roots: string[]): { sample: string[]; omittedFromSample: number } {
	const sorted = [...new Set(paths)].sort();
	const sample: string[] = [];
	const push = (value: string) => {
		if (sample.length < SAMPLE_LIMIT && !sample.includes(value)) sample.push(value);
	};
	if (roots.length <= SAMPLE_LIMIT) {
		for (const root of roots.sort()) push(root);
	}
	const firstBudget = Math.floor((SAMPLE_LIMIT - sample.length) / 2);
	for (const value of sorted.slice(0, Math.max(0, firstBudget))) push(value);
	for (const value of sorted.slice(-Math.max(0, SAMPLE_LIMIT - sample.length))) push(value);
	return { sample, omittedFromSample: Math.max(0, sorted.length - sample.length) };
}

export async function buildDeletionSnapshot(cwd: string, invocations: ParsedRmInvocation[], signal?: AbortSignal): Promise<DeletionSnapshot> {
	const snapshotInvocations: SnapshotInvocation[] = [];
	const entries: EntryRecord[] = [];
	for (const invocation of invocations) {
		throwIfAborted(signal);
		const resolved = await resolveInvocationRoots(cwd, invocation);
		snapshotInvocations.push(resolved);
		for (const root of resolved.roots) await collectEntries(root, entries, signal);
	}
	const roots = [...new Set(snapshotInvocations.flatMap((invocation) => invocation.roots))].sort();
	const missingOperands = [...new Set(snapshotInvocations.flatMap((invocation) => invocation.missingOperands))].sort();
	const unmatchedPatterns = [...new Set(snapshotInvocations.flatMap((invocation) => invocation.unmatchedPatterns))].sort();
	if (entries.length === 0) {
		const markerHash = createHash("sha256");
		for (const missing of missingOperands) markerHash.update(`M\0${missing}\0`);
		for (const unmatched of unmatchedPatterns) markerHash.update(`G\0${unmatched}\0`);
		return {
			roots,
			missingOperands,
			unmatchedPatterns,
			counts: { total: 0, files: 0, directories: 0, symlinks: 0, other: 0 },
			apparentBytes: 0,
			sample: [],
			omittedFromSample: 0,
			fingerprint: markerHash.digest("hex"),
			invocations: snapshotInvocations,
		};
	}
	const uniqueEntries = [...new Map(entries.map((entry) => [entry.absolutePath, entry])).values()].sort((a, b) => a.absolutePath.localeCompare(b.absolutePath));
	const counts = { total: uniqueEntries.length, files: 0, directories: 0, symlinks: 0, other: 0 };
	let apparentBytes = 0;
	for (const entry of uniqueEntries) {
		if (entry.type === "file") {
			counts.files += 1;
			apparentBytes += entry.size;
		} else if (entry.type === "directory") counts.directories += 1;
		else if (entry.type === "symlink") counts.symlinks += 1;
		else counts.other += 1;
	}
	const hash = createHash("sha256");
	for (const entry of uniqueEntries) hash.update(`E\0${entry.absolutePath}\0${entry.type}\0`);
	for (const missing of missingOperands) hash.update(`M\0${missing}\0`);
	for (const unmatched of unmatchedPatterns) hash.update(`G\0${unmatched}\0`);
	const { sample, omittedFromSample } = makeSample(uniqueEntries.map((entry) => entry.absolutePath), roots);
	return {
		roots,
		missingOperands,
		unmatchedPatterns,
		counts,
		apparentBytes,
		sample,
		omittedFromSample,
		fingerprint: hash.digest("hex"),
		invocations: snapshotInvocations,
	};
}

function formatSnapshotText(request: PendingRmValidation, snapshot: DeletionSnapshot): string {
	const lines = [
		"Validated rm deletion set. Retry the exact same bash command once within five minutes to approve execution.",
		`Request: ${request.requestId}`,
		`Working directory: ${escapePath(request.cwd)}`,
		`Command: ${escapePath(request.command)}`,
		`Expires: ${new Date(request.expiresAt ?? Date.now()).toISOString()}`,
		"",
		"Concrete top-level roots:",
		...(snapshot.roots.length > 0 ? snapshot.roots.map((root) => `- ${escapePath(root)}`) : ["- (none)"]),
		"",
		`Counts: ${snapshot.counts.total} total; ${snapshot.counts.files} files; ${snapshot.counts.directories} directories; ${snapshot.counts.symlinks} symlinks; ${snapshot.counts.other} other`,
		`Apparent regular-file bytes: ${snapshot.apparentBytes}`,
		"",
		"Sample paths:",
		...(snapshot.sample.length > 0 ? snapshot.sample.map((sample) => `- ${escapePath(sample)}`) : ["- (none)"]),
		`Omitted sample entries: ${snapshot.omittedFromSample}`,
	];
	const warnings: string[] = [];
	if (snapshot.missingOperands.length > 0) warnings.push(`Missing literal operands: ${snapshot.missingOperands.map(escapePath).join(", ")}`);
	if (snapshot.unmatchedPatterns.length > 0) warnings.push(`Unmatched glob patterns: ${snapshot.unmatchedPatterns.map(escapePath).join(", ")}`);
	if (warnings.length > 0) lines.push("", "Warnings:", ...warnings.map((warning) => `- ${warning}`));
	return lines.join("\n");
}

function stateDetails(state: ValidationState, request: PendingRmValidation | undefined, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		state,
		requestId: request?.requestId,
		command: request?.command,
		cwd: request?.cwd,
		expiresAt: request?.expiresAt,
		...extra,
	};
}

function noMatchingTargetsResult(request: PendingRmValidation, snapshot: DeletionSnapshot): ValidationResult {
	return {
		state: "no_matching_targets",
		text: "No existing rm targets matched. No executable approval was created; skip the deletion.",
		details: stateDetails("no_matching_targets", request, { snapshot }),
		snapshot,
	};
}

async function validateRequest(request: PendingRmValidation, signal?: AbortSignal): Promise<ValidationResult> {
	if (request.consumed) return { state: "already_consumed", text: "Request was already consumed.", details: stateDetails("already_consumed", request) };
	const expiry = request.expiresAt ?? request.createdAt + APPROVAL_TTL_MS;
	if (Date.now() > expiry) return { state: "expired", text: "Request expired. Re-run the bash command to create a fresh validation request.", details: stateDetails("expired", request) };
	if (request.analysisStatus === "dynamic_target") {
		return { state: "dynamic_target", text: `Dynamic rm target rejected. ${request.analysisMessage ?? "Rewrite using concrete literal paths or supported standard globs."}`, details: stateDetails("dynamic_target", request) };
	}
	if (request.analysisStatus === "unsupported_syntax") {
		return { state: "unsupported_syntax", text: `Unsupported rm syntax rejected. ${request.analysisMessage ?? "Rewrite using concrete literal paths or supported standard globs."}`, details: stateDetails("unsupported_syntax", request) };
	}
	try {
		const snapshot = await buildDeletionSnapshot(request.cwd, request.parsedInvocations, signal);
		if (snapshot.counts.total === 0) {
			request.snapshot = snapshot;
			return noMatchingTargetsResult(request, snapshot);
		}
		request.snapshot = snapshot;
		request.validatedAt = Date.now();
		request.expiresAt = request.validatedAt + APPROVAL_TTL_MS;
		return { state: "validated", text: formatSnapshotText(request, snapshot), details: stateDetails("validated", request, { snapshot }), snapshot };
	} catch (error) {
		if (error instanceof RmValidationError) {
			return { state: error.state, text: error.message, details: stateDetails(error.state, request, error.details) };
		}
		return { state: "filesystem_error", text: error instanceof Error ? error.message : String(error), details: stateDetails("filesystem_error", request) };
	}
}

function sessionKey(ctx: ExtensionContext): string {
	const manager = ctx.sessionManager as any;
	return manager.getSessionId?.() ?? manager.sessionId ?? manager.getSessionFile?.() ?? manager.getLeafId?.() ?? "ephemeral";
}

function hasUsableApproval(request: PendingRmValidation, session: string, command: string, cwd: string): boolean {
	return request.sessionKey === session && request.command === command && request.cwd === cwd && !request.consumed && Boolean(request.snapshot && request.validatedAt && request.expiresAt && request.expiresAt > Date.now());
}

function findApproval(requests: Map<string, PendingRmValidation>, session: string, command: string, cwd: string): PendingRmValidation | undefined {
	for (const request of requests.values()) {
		if (hasUsableApproval(request, session, command, cwd)) return request;
	}
	return undefined;
}

function createRequest(requests: Map<string, PendingRmValidation>, session: string, command: string, cwd: string, analysis: CommandAnalysis): PendingRmValidation {
	for (const existing of requests.values()) {
		if (existing.sessionKey === session && existing.command === command && existing.cwd === cwd && !existing.consumed) {
			existing.consumed = true;
		}
	}
	const request: PendingRmValidation = {
		requestId: randomUUID(),
		sessionKey: session,
		command,
		cwd,
		createdAt: Date.now(),
		parsedInvocations: analysis.invocations,
		analysisStatus: analysis.status,
		analysisMessage: analysis.message,
		consumed: false,
	};
	requests.set(request.requestId, request);
	return request;
}

function blockReason(request: PendingRmValidation): string {
	return [
		"Blocked: no files were deleted.",
		"A recursive-force rm command must be validated before it can run.",
		"Call validate_rm with:",
		JSON.stringify({ requestId: request.requestId }),
		"Then inspect the deletion summary and retry the exact same bash command if it is correct.",
	].join("\n");
}

function changedBlockReason(request: PendingRmValidation): string {
	return [
		"Blocked: no files were deleted.",
		"The validated rm target set changed or expired, so revalidation is required.",
		"Call validate_rm with:",
		JSON.stringify({ requestId: request.requestId }),
	].join("\n");
}

function quoteRoots(roots: string[]): string {
	return roots.map(shellQuote).join(" ");
}

export function rewriteCommand(command: string, analysis: CommandAnalysis, snapshot: DeletionSnapshot): string | undefined {
	if (analysis.status !== "ok") return undefined;
	if (analysis.invocations.some((invocation) => invocation.nested)) return undefined;
	const rootsByInvocation = new Map(snapshot.invocations.map((invocation) => [invocation.invocationId, invocation.roots]));
	let rewritten = command;
	const ranges = [...analysis.invocations].sort((a, b) => b.operandReplaceStart - a.operandReplaceStart);
	for (const invocation of ranges) {
		const roots = rootsByInvocation.get(invocation.id) ?? [];
		if (roots.length === 0) return undefined;
		const before = rewritten.slice(0, invocation.operandReplaceStart);
		const separator = before.length > 0 && !/\s$/.test(before) ? " " : "";
		const replacement = `${separator}-- ${quoteRoots(roots)}`;
		rewritten = `${before}${replacement}${rewritten.slice(invocation.operandReplaceEnd)}`;
	}
	return rewritten;
}

export function createSafeRmState(): Map<string, PendingRmValidation> {
	return new Map();
}

export default function safeRm(pi: ExtensionAPI) {
	const requests = createSafeRmState();

	pi.registerTool({
		name: "validate_rm",
		label: "Validate rm",
		description: "Validate a previously blocked recursive-force rm command and summarize the exact deletion set before a one-time retry.",
		promptSnippet: "Validate a blocked recursive-force rm command before retrying it.",
		promptGuidelines: [
			"Use validate_rm only when Pi blocks a bash rm command and provides a requestId.",
			"After validate_rm returns a validated deletion summary, inspect it and retry the exact same bash command only if the deletion set is correct.",
			"Do not work around a validate_rm refusal by splitting the same directory tree into child deletion commands or manual batches.",
		],
		parameters: Type.Object({
			requestId: Type.String({ description: "Opaque request ID from the blocked bash tool result" }),
		}),
		async execute(_toolCallId, params: ValidateRmParams, signal, _onUpdate, ctx) {
			const request = requests.get(params.requestId);
			if (!request) {
				const details = { state: "unknown_request", requestId: params.requestId };
				return { content: [{ type: "text" as const, text: "Unknown rm validation request. Re-run the bash command to create a fresh request." }], details };
			}
			if (request.sessionKey !== sessionKey(ctx)) {
				const details = stateDetails("cross_session", request);
				return { content: [{ type: "text" as const, text: "This rm validation request belongs to a different session." }], details };
			}
			const result = await validateRequest(request, signal);
			return { content: [{ type: "text" as const, text: result.text }], details: result.details };
		},
	});

	pi.on("session_shutdown", () => {
		requests.clear();
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!isBashToolCallEvent(event)) return;
		const command = event.input.command;
		if (typeof command !== "string") return;
		const cwd = path.resolve(ctx.cwd);
		const session = sessionKey(ctx);
		const analysis = analyzeCommand(command);
		if (analysis.status === "ok" && analysis.invocations.length === 0) return;

		const approval = findApproval(requests, session, command, cwd);
		if (approval) {
			approval.consumed = true;
			const freshAnalysis = analyzeCommand(command);
			if (freshAnalysis.status !== "ok") {
				const fresh = createRequest(requests, session, command, cwd, freshAnalysis);
				return { block: true, reason: changedBlockReason(fresh) };
			}
			let freshSnapshot: DeletionSnapshot;
			try {
				freshSnapshot = await buildDeletionSnapshot(cwd, freshAnalysis.invocations, ctx.signal);
			} catch {
				const fresh = createRequest(requests, session, command, cwd, freshAnalysis);
				return { block: true, reason: changedBlockReason(fresh) };
			}
			if (freshSnapshot.counts.total === 0 || freshSnapshot.fingerprint !== approval.snapshot?.fingerprint) {
				const fresh = createRequest(requests, session, command, cwd, freshAnalysis);
				return { block: true, reason: changedBlockReason(fresh) };
			}
			const rewritten = rewriteCommand(command, freshAnalysis, freshSnapshot);
			if (!rewritten) {
				return { block: true, reason: "Blocked: no files were deleted. The approved rm command could not be safely rewritten to concrete operands." };
			}
			event.input.command = rewritten;
			return;
		}

		const request = createRequest(requests, session, command, cwd, analysis);
		return { block: true, reason: blockReason(request) };
	});
}
