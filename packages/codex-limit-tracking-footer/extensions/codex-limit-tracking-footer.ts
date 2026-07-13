import * as os from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export type LimitWindow = {
	id: string;
	label: string;
	remainingPercent?: number;
	usedPercent?: number;
	resetAt?: number;
	unitLabel?: string;
};

export type LimitSnapshot = {
	providerId: string;
	providerLabel: string;
	accountLabel?: string;
	windows: LimitWindow[];
	fetchedAt: number;
	stale?: boolean;
	error?: string;
};

export type LimitTracker = {
	id: string;
	label: string;
	matchesProvider(provider: string | undefined): boolean;
	fetchSnapshot(ctx: ExtensionContext, options?: { force?: boolean }): Promise<LimitSnapshot>;
};

export const CACHE_TTL_MS = 15_000;
export const REFRESH_INTERVAL_MS = 60_000;
export const CODEX_FETCH_TIMEOUT_MS = 15_000;
export const LIMIT_STATUS_KEY = "codex-limits";
export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export const CODEX_LIMITS_REFRESH_ARG = "refresh";
export const CODEX_DASHBOARD_URL = "https://chatgpt.com/codex/settings/usage";

const CODEX_PROVIDER_PATTERN = /^openai-codex(?:[-_]?[0-9]+)?$/;
const CODEX_JWT_AUTH_CLAIM = "https://api.openai.com/auth";

export type LimitSemanticColor = "success" | "warning" | "error";

export type LimitThemeLike = Pick<ExtensionContext["ui"]["theme"], "fg">;

export type LimitStatusStyles = {
	text: (text: string) => string;
	success: (text: string) => string;
	warning: (text: string) => string;
	error: (text: string) => string;
	muted: (text: string) => string;
	dim: (text: string) => string;
};

export type LimitTrackingState = {
	activeProvider?: string;
	activeTracker?: LimitTracker;
	snapshotByTracker: Map<string, LimitSnapshot>;
	lastAttemptByTracker: Map<string, number>;
	lastErrorByTracker: Map<string, string>;
	inFlightRefresh: Map<string, Promise<LimitSnapshot | null>>;
	refreshTimer?: ReturnType<typeof setInterval>;
	sessionActive: boolean;
};

type UnknownRecord = Record<string, unknown>;

type CodexWindowCandidate = {
	window: LimitWindow;
	score: number;
};

const trackerRegistry = new Map<string, LimitTracker>();

export function registerTracker(tracker: LimitTracker): void {
	trackerRegistry.set(tracker.id, tracker);
}

export function findTracker(provider: string | undefined): LimitTracker | undefined {
	for (const tracker of trackerRegistry.values()) {
		if (tracker.matchesProvider(provider)) return tracker;
	}
	return undefined;
}

export function getTrackerCacheKey(trackerId: string, providerId: string | undefined): string {
	return `${trackerId}:${providerId ?? ""}`;
}

export function createLimitTrackingState(): LimitTrackingState {
	return {
		snapshotByTracker: new Map(),
		lastAttemptByTracker: new Map(),
		lastErrorByTracker: new Map(),
		inFlightRefresh: new Map(),
		sessionActive: false,
	};
}

export function createLimitStatusStyles(theme: LimitThemeLike): LimitStatusStyles {
	return {
		text: (text) => theme.fg("muted", text),
		success: (text) => theme.fg("success", text),
		warning: (text) => theme.fg("warning", text),
		error: (text) => theme.fg("error", text),
		muted: (text) => theme.fg("muted", text),
		dim: (text) => theme.fg("dim", text),
	};
}

export function clampPercent(value: number): number {
	return Math.max(0, Math.min(100, value));
}

export function remainingPercent(window: LimitWindow): number | undefined {
	if (typeof window.remainingPercent === "number" && Number.isFinite(window.remainingPercent)) {
		return clampPercent(window.remainingPercent);
	}
	if (typeof window.usedPercent === "number" && Number.isFinite(window.usedPercent)) {
		return clampPercent(100 - window.usedPercent);
	}
	return undefined;
}

export function getRemainingColor(remaining: number): LimitSemanticColor {
	if (remaining > 50) return "success";
	if (remaining >= 20) return "warning";
	return "error";
}

export function formatPercent(value: number): string {
	return `${Math.round(clampPercent(value))}%`;
}

export function formatWindowStatus(window: LimitWindow, styles: LimitStatusStyles): string | undefined {
	const remaining = remainingPercent(window);
	if (remaining === undefined) return undefined;
	const text = `${window.label} ${formatPercent(remaining)} left`;
	return styles[getRemainingColor(remaining)](text);
}

export function formatDurationShort(durationMs: number): string {
	const ms = Math.max(0, durationMs);
	if (ms < 60_000) return `${Math.floor(ms / 1_000)}s`;
	if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
	if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
	return `${Math.floor(ms / 86_400_000)}d`;
}

export function formatSnapshotAge(snapshot: LimitSnapshot, now = Date.now()): string {
	return formatDurationShort(now - snapshot.fetchedAt);
}

export function formatResetTime(resetAt: number, now = Date.now()): string {
	if (!Number.isFinite(resetAt)) return "unknown";
	const delta = resetAt - now;
	if (delta <= 0) return "now";
	return `in ${formatDurationShort(delta)}`;
}

export function formatStaleSuffix(snapshot: LimitSnapshot, now = Date.now()): string {
	if (!snapshot.stale) return "";
	return `stale ${formatSnapshotAge(snapshot, now)}`;
}

export function formatCompactFooter(snapshot: LimitSnapshot, styles: LimitStatusStyles, now = Date.now()): string | undefined {
	const windows = snapshot.windows.map((window) => formatWindowStatus(window, styles)).filter((value): value is string => Boolean(value));
	if (windows.length === 0) return undefined;

	let text = windows.join(styles.muted(" · "));
	const staleSuffix = formatStaleSuffix(snapshot, now);
	if (staleSuffix) {
		text += ` ${styles.muted("stale")} ${styles.dim(formatSnapshotAge(snapshot, now))}`;
	}
	return text;
}

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string): string {
	return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getRecordValue(record: UnknownRecord, normalizedKeys: string[]): unknown {
	const wanted = new Set(normalizedKeys.map(normalizeKey));
	for (const [key, value] of Object.entries(record)) {
		if (wanted.has(normalizeKey(key))) return value;
	}
	return undefined;
}

function asNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const match = value.trim().match(/^-?\d+(?:\.\d+)?/);
		if (match) {
			const parsed = Number(match[0]);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
	return undefined;
}

function asPercent(value: unknown): number | undefined {
	const parsed = asNumber(value);
	if (parsed === undefined) return undefined;
	// Codex's `*_percent` fields are already expressed on a 0–100 scale.
	return clampPercent(parsed);
}

function asTimestamp(value: unknown): number | undefined {
	const parsed = asNumber(value);
	if (parsed !== undefined) {
		const millis = parsed < 10_000_000_000 ? parsed * 1_000 : parsed;
		return Number.isFinite(millis) ? millis : undefined;
	}
	if (typeof value === "string") {
		const millis = Date.parse(value);
		return Number.isFinite(millis) ? millis : undefined;
	}
	return undefined;
}

function readPercentField(record: UnknownRecord, keys: string[]): number | undefined {
	return asPercent(getRecordValue(record, keys));
}

function readCountField(record: UnknownRecord, keys: string[]): number | undefined {
	const value = asNumber(getRecordValue(record, keys));
	return value !== undefined && value >= 0 ? value : undefined;
}

function computePercentFromCounts(usedCount: number | undefined, remainingCount: number | undefined, limitCount: number | undefined) {
	if (limitCount === undefined || limitCount <= 0) return {};
	const usedPercent = usedCount !== undefined ? clampPercent((usedCount / limitCount) * 100) : undefined;
	const remainingPercent = remainingCount !== undefined ? clampPercent((remainingCount / limitCount) * 100) : undefined;
	return { usedPercent, remainingPercent };
}

function readDurationMs(record: UnknownRecord): number | undefined {
	const raw = getRecordValue(record, [
		"windowMs",
		"durationMs",
		"periodMs",
		"windowMilliseconds",
		"durationMilliseconds",
	]);
	const millis = asNumber(raw);
	if (millis !== undefined) return millis;

	const seconds = asNumber(getRecordValue(record, ["windowSeconds", "limitWindowSeconds", "durationSeconds", "periodSeconds", "resetAfterSeconds"]));
	if (seconds !== undefined) return seconds * 1_000;

	const minutes = asNumber(getRecordValue(record, ["windowMinutes", "durationMinutes", "periodMinutes"]));
	if (minutes !== undefined) return minutes * 60_000;

	const hours = asNumber(getRecordValue(record, ["windowHours", "durationHours", "periodHours"]));
	if (hours !== undefined) return hours * 3_600_000;

	const days = asNumber(getRecordValue(record, ["windowDays", "durationDays", "periodDays"]));
	if (days !== undefined) return days * 86_400_000;

	return undefined;
}

function readResetAt(record: UnknownRecord, now: number): number | undefined {
	const absolute = asTimestamp(getRecordValue(record, [
		"resetAt",
		"resetsAt",
		"resetTime",
		"nextResetAt",
		"resetDate",
		"windowResetAt",
		"endTime",
		"endsAt",
	]));
	if (absolute !== undefined) return absolute;

	const seconds = asNumber(getRecordValue(record, ["resetAfterSeconds", "secondsUntilReset", "retryAfterSeconds"]));
	if (seconds !== undefined) return now + seconds * 1_000;

	const millis = asNumber(getRecordValue(record, ["resetAfterMs", "millisecondsUntilReset", "retryAfterMs"]));
	if (millis !== undefined) return now + millis;

	return undefined;
}

function windowIdFromDescriptor(record: UnknownRecord, path: string, now: number): "5h" | "7d" | undefined {
	const descriptorParts = [
		path,
		getRecordValue(record, ["id", "key", "name", "label", "window", "windowType", "period", "interval", "duration", "type"]),
	]
		.flat()
		.filter((value) => typeof value === "string" || typeof value === "number")
		.map(String);
	const descriptor = descriptorParts.join(" ").toLowerCase();

	if (/\b(5\s*h|5\s*hr|5\s*hour|five\s*hour|300\s*m|300\s*min)/i.test(descriptor)) return "5h";
	if (/\b(7\s*d|7\s*day|seven\s*day|week|weekly)/i.test(descriptor)) return "7d";
	if (/\b(rolling|short)[-_\s]?(window|limit)?\b/i.test(descriptor)) return "5h";

	const durationMs = readDurationMs(record);
	if (durationMs !== undefined) {
		if (Math.abs(durationMs - 5 * 3_600_000) <= 5 * 60_000) return "5h";
		if (Math.abs(durationMs - 7 * 86_400_000) <= 60 * 60_000) return "7d";
	}

	const resetAt = readResetAt(record, now);
	if (resetAt !== undefined) {
		const delta = resetAt - now;
		if (delta > 0 && Math.abs(delta - 5 * 3_600_000) <= 15 * 60_000) return "5h";
		if (delta > 0 && Math.abs(delta - 7 * 86_400_000) <= 6 * 3_600_000) return "7d";
	}

	return undefined;
}

function candidateFromRecord(record: UnknownRecord, path: string, now: number): CodexWindowCandidate | undefined {
	const id = windowIdFromDescriptor(record, path, now);
	if (!id) return undefined;

	const explicitRemainingPercent = readPercentField(record, [
		"remainingPercent",
		"remaining_percentage",
		"percentRemaining",
		"percentageRemaining",
		"remainingPct",
		"pctRemaining",
		"availablePercent",
		"leftPercent",
		"percentLeft",
		"limitLeftPercent",
	]);
	const explicitUsedPercent = readPercentField(record, [
		"usedPercent",
		"used_percentage",
		"percentUsed",
		"percentageUsed",
		"usedPct",
		"pctUsed",
		"usagePercent",
		"usage_percentage",
		"percentUsage",
		"consumedPercent",
	]);

	const usedCount = readCountField(record, ["used", "consumed", "current", "usage", "count", "usedCount", "requestsUsed"]);
	const remainingCount = readCountField(record, ["remaining", "left", "available", "remainingCount", "requestsRemaining"]);
	const limitCount = readCountField(record, ["limit", "quota", "max", "maximum", "total", "cap", "allowed", "limitCount", "requestLimit"]);
	const countPercents = computePercentFromCounts(usedCount, remainingCount, limitCount);

	const usedPercent = explicitUsedPercent ?? countPercents.usedPercent;
	const remainingPercent = explicitRemainingPercent ?? countPercents.remainingPercent ?? (usedPercent !== undefined ? clampPercent(100 - usedPercent) : undefined);
	if (remainingPercent === undefined && usedPercent === undefined) return undefined;

	const resetAt = readResetAt(record, now);
	const window: LimitWindow = {
		id,
		label: id,
		...(remainingPercent !== undefined ? { remainingPercent } : {}),
		...(usedPercent !== undefined ? { usedPercent } : {}),
		...(resetAt !== undefined ? { resetAt } : {}),
	};
	const score = (explicitRemainingPercent !== undefined ? 5 : 0) + (explicitUsedPercent !== undefined ? 4 : 0) + (resetAt !== undefined ? 2 : 0) + (path.includes(id) ? 1 : 0);
	return { window, score };
}

function sortCodexWindows(windows: LimitWindow[]): LimitWindow[] {
	const order = new Map<string, number>([["5h", 0], ["7d", 1]]);
	return [...windows].sort((left, right) => (order.get(left.id) ?? 99) - (order.get(right.id) ?? 99));
}

function dedupeCodexWindows(windows: LimitWindow[]): LimitWindow[] {
	const byId = new Map<string, LimitWindow>();
	for (const window of windows) {
		if (!byId.has(window.id)) byId.set(window.id, window);
	}
	return sortCodexWindows([...byId.values()]);
}

function responseAccountLabel(raw: UnknownRecord | undefined, fallback: string | undefined): string | undefined {
	const value = typeof raw?.email === "string" ? raw.email.trim() : "";
	return value || fallback;
}

// Endpoint/schema assumption: /wham/usage returns rate_limit.primary_window and
// rate_limit.secondary_window objects with used_percent, limit_window_seconds, and reset_at.
// Some accounts currently receive only a weekly primary_window with secondary_window null.
export function normalizeCodexUsageResponse(payload: unknown, providerId = "openai-codex", accountLabel?: string, now = Date.now()): LimitSnapshot {
	const raw = isRecord(payload) ? payload : undefined;
	const rateLimit = raw ? getRecordValue(raw, ["rateLimit", "rate_limit"]) : undefined;
	const rateLimitRecord = isRecord(rateLimit) ? rateLimit : undefined;
	const primaryWindow = rateLimitRecord ? getRecordValue(rateLimitRecord, ["primaryWindow", "primary_window"]) : undefined;
	const secondaryWindow = rateLimitRecord ? getRecordValue(rateLimitRecord, ["secondaryWindow", "secondary_window"]) : undefined;
	const primaryRecord = isRecord(primaryWindow) ? primaryWindow : undefined;
	const secondaryRecord = isRecord(secondaryWindow) ? secondaryWindow : undefined;
	const primary = primaryRecord ? normalizeCodexRateLimitWindow(primaryRecord, "5h", now) : undefined;
	const secondary = secondaryRecord ? normalizeCodexRateLimitWindow(secondaryRecord, "7d", now) : undefined;
	const explicitWindows = [primary, secondary].filter((window): window is LimitWindow => Boolean(window));
	const identifiedExplicitWindows = [
		primaryRecord && windowIdFromDescriptor(primaryRecord, "rate_limit.primary_window", now) ? primary : undefined,
		secondaryRecord && windowIdFromDescriptor(secondaryRecord, "rate_limit.secondary_window", now) ? secondary : undefined,
	].filter((window): window is LimitWindow => Boolean(window));
	if (explicitWindows.length === 2 || identifiedExplicitWindows.length > 0) {
		const windows = explicitWindows.length === 2 ? explicitWindows : identifiedExplicitWindows;
		return {
			providerId,
			providerLabel: "Codex",
			...(responseAccountLabel(raw, accountLabel) ? { accountLabel: responseAccountLabel(raw, accountLabel) } : {}),
			windows: dedupeCodexWindows(windows),
			fetchedAt: now,
		};
	}

	const bestByWindow = new Map<"5h" | "7d", CodexWindowCandidate>();
	const seen = new WeakSet<object>();

	const visit = (value: unknown, path: string) => {
		if (Array.isArray(value)) {
			value.forEach((item, index) => visit(item, `${path}[${index}]`));
			return;
		}
		if (!isRecord(value) || seen.has(value)) return;
		seen.add(value);

		const candidate = candidateFromRecord(value, path, now);
		if (candidate) {
			const previous = bestByWindow.get(candidate.window.id as "5h" | "7d");
			if (!previous || candidate.score > previous.score) {
				bestByWindow.set(candidate.window.id as "5h" | "7d", candidate);
			}
		}

		for (const [key, child] of Object.entries(value)) {
			visit(child, path ? `${path}.${key}` : key);
		}
	};

	visit(payload, "");

	const windows = (["5h", "7d"] as const)
		.map((id) => bestByWindow.get(id)?.window)
		.filter((window): window is LimitWindow => Boolean(window));
	if (windows.length === 0) {
		throw new Error("Codex usage response did not include any recognizable limit windows");
	}

	return {
		providerId,
		providerLabel: "Codex",
		...(responseAccountLabel(raw, accountLabel) ? { accountLabel: responseAccountLabel(raw, accountLabel) } : {}),
		windows,
		fetchedAt: now,
	};
}

function normalizeCodexRateLimitWindow(record: UnknownRecord, fallbackId: "5h" | "7d", now: number): LimitWindow | undefined {
	const windowSeconds = asNumber(getRecordValue(record, ["windowSeconds", "limitWindowSeconds", "limit_window_seconds"]));
	const windowMinutes = asNumber(getRecordValue(record, ["windowMinutes", "window_minutes"]));
	const id =
		windowSeconds === 5 * 3_600 || windowMinutes === 300
			? "5h"
			: windowSeconds === 7 * 86_400 || windowMinutes === 10_080
				? "7d"
				: fallbackId;
	const usedPercent = readPercentField(record, ["usedPercent", "used_percent"]);
	const remaining = usedPercent !== undefined ? clampPercent(100 - usedPercent) : undefined;
	const resetAt = readResetAt(record, now);
	if (usedPercent === undefined && remaining === undefined) return undefined;
	return {
		id,
		label: id,
		...(usedPercent !== undefined ? { usedPercent } : {}),
		...(remaining !== undefined ? { remainingPercent: remaining } : {}),
		...(resetAt !== undefined ? { resetAt } : {}),
	};
}

function decodeJwtPayload(token: string): UnknownRecord {
	const parts = token.split(".");
	if (parts.length !== 3) throw new Error("Invalid OAuth token format");
	const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
	const decoded = Buffer.from(padded, "base64").toString("utf8");
	const parsed = JSON.parse(decoded) as unknown;
	if (!isRecord(parsed)) throw new Error("Invalid OAuth token claims");
	return parsed;
}

function getAuthClaimObject(payload: UnknownRecord): UnknownRecord | undefined {
	const claim = payload[CODEX_JWT_AUTH_CLAIM];
	return isRecord(claim) ? claim : undefined;
}

function extractAccountIdFromClaims(payload: UnknownRecord): string | undefined {
	const nested = getAuthClaimObject(payload);
	const value = payload[`${CODEX_JWT_AUTH_CLAIM}.chatgpt_account_id`] ?? nested?.chatgpt_account_id;
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeAccountLabelFromClaims(payload: UnknownRecord): string | undefined {
	const nested = getAuthClaimObject(payload);
	const candidates = [
		payload.email,
		nested?.email,
		payload[`${CODEX_JWT_AUTH_CLAIM}.email`],
		payload.name,
		nested?.name,
		payload.preferred_username,
	];
	for (const candidate of candidates) {
		if (typeof candidate !== "string") continue;
		const value = candidate.trim();
		if (!value || value.length > 120) continue;
		if (/account|org|user[_-]?id/i.test(value)) continue;
		if (/^[-_a-z0-9]{24,}$/i.test(value)) continue;
		return value;
	}
	return undefined;
}

function extractBearerToken(headers: Record<string, string> | undefined): string | undefined {
	if (!headers) return undefined;
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() !== "authorization") continue;
		const match = value.match(/^Bearer\s+(.+)$/i);
		if (match) return match[1].trim();
	}
	return undefined;
}

function createCodexHeaders(authHeaders: Record<string, string> | undefined, token: string, accountId: string): Headers {
	const headers = new Headers(authHeaders);
	headers.set("Authorization", `Bearer ${token}`);
	headers.set("chatgpt-account-id", accountId);
	headers.set("originator", "pi");
	headers.set("User-Agent", `pi (${os.platform()} ${os.release()}; ${os.arch()})`);
	headers.set("accept", "application/json");
	return headers;
}

// User-visible diagnostics must stay sanitized: never include tokens, account IDs, or raw headers.
export function sanitizeCodexError(error: unknown, secrets: string[] = []): string {
	const raw = error instanceof Error ? error.message : String(error);
	let text = raw
		.replace(/(authorization\s*[":=]\s*)bearer\s+[^"\s,}]+/gi, "$1Bearer [redacted]")
		.replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
		.replace(/(chatgpt-account-id\s*[":=]\s*)[^"\s,}]+/gi, "$1[redacted]")
		.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-jwt]")
		.replace(/\b(?:acc|acct|account|org|user)-[A-Za-z0-9_-]{6,}\b/gi, "[redacted-id]")
		.replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[redacted]");
	for (const secret of secrets) {
		if (secret.length >= 6) text = text.split(secret).join("[redacted]");
	}
	return text.slice(0, 500);
}

export async function fetchCodexUsage(
	headers: Headers,
	options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<unknown> {
	const controller = new AbortController();
	const timeoutMs = options.timeoutMs ?? CODEX_FETCH_TIMEOUT_MS;
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onAbort = () => controller.abort();
	options.signal?.addEventListener("abort", onAbort, { once: true });

	try {
		const response = await fetch(CODEX_USAGE_URL, { method: "GET", headers, signal: controller.signal });
		if (!response.ok) throw new Error(`Codex usage request failed (${response.status})`);

		const text = await response.text();
		if (!text.trim()) throw new Error("Codex usage response was empty");
		try {
			return JSON.parse(text) as unknown;
		} catch {
			throw new Error("Codex usage response was not valid JSON");
		}
	} catch (error) {
		if (controller.signal.aborted) throw new Error("Codex usage request timed out");
		throw error;
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener("abort", onAbort);
	}
}

function failedCodexSnapshot(providerId: string | undefined, error: unknown, secrets: string[] = []): LimitSnapshot {
	return {
		providerId: providerId ?? "openai-codex",
		providerLabel: "Codex",
		windows: [],
		fetchedAt: Date.now(),
		error: sanitizeCodexError(error, secrets),
	};
}

export const codexTracker: LimitTracker = {
	id: "codex",
	label: "Codex",
	matchesProvider(provider: string | undefined): boolean {
		return CODEX_PROVIDER_PATTERN.test(provider ?? "");
	},
	async fetchSnapshot(ctx: ExtensionContext): Promise<LimitSnapshot> {
		const model = ctx.model;
		const providerId = model?.provider ?? "openai-codex";
		const secrets: string[] = [];
		try {
			if (!model || !this.matchesProvider(model.provider)) {
				throw new Error("Active model provider is not a Codex subscription provider");
			}
			if (typeof ctx.modelRegistry.isUsingOAuth === "function" && !ctx.modelRegistry.isUsingOAuth(model)) {
				throw new Error("Active Codex model is not using Pi-managed OAuth credentials");
			}

			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!auth.ok) throw new Error("Pi could not resolve Codex credentials");

			const token = auth.apiKey?.replace(/^Bearer\s+/i, "").trim() || extractBearerToken(auth.headers);
			if (!token) throw new Error("Pi could not resolve a Codex OAuth access token");
			secrets.push(token);

			const claims = decodeJwtPayload(token);
			const accountId = extractAccountIdFromClaims(claims);
			if (!accountId) throw new Error("Codex OAuth token did not include required account metadata");
			secrets.push(accountId);

			const headers = createCodexHeaders(auth.headers, token, accountId);
			const accountLabel = safeAccountLabelFromClaims(claims);
			const payload = await fetchCodexUsage(headers);
			return normalizeCodexUsageResponse(payload, providerId, accountLabel);
		} catch (error) {
			return failedCodexSnapshot(providerId, error, secrets);
		}
	},
};

function hasRenderableSnapshot(snapshot: LimitSnapshot | undefined): snapshot is LimitSnapshot {
	return Boolean(snapshot && snapshot.windows.length > 0);
}

function clearFooterStatus(ctx: ExtensionContext): void {
	ctx.ui.setStatus(LIMIT_STATUS_KEY, undefined);
}

function renderFooterStatus(ctx: ExtensionContext, snapshot: LimitSnapshot | undefined): void {
	if (!hasRenderableSnapshot(snapshot)) {
		clearFooterStatus(ctx);
		return;
	}
	const text = formatCompactFooter(snapshot, createLimitStatusStyles(ctx.ui.theme));
	ctx.ui.setStatus(LIMIT_STATUS_KEY, text);
}

function usedPercent(window: LimitWindow): number | undefined {
	if (typeof window.usedPercent === "number" && Number.isFinite(window.usedPercent)) {
		return clampPercent(window.usedPercent);
	}
	const remaining = remainingPercent(window);
	return remaining !== undefined ? clampPercent(100 - remaining) : undefined;
}

function formatLocalTime(timestamp: number): string {
	const date = new Date(timestamp);
	return Number.isFinite(date.getTime()) ? date.toLocaleString() : "unknown";
}

function formatWindowDetails(window: LimitWindow, now = Date.now()): string {
	const parts: string[] = [];
	const remaining = remainingPercent(window);
	const used = usedPercent(window);
	if (remaining !== undefined) parts.push(`${formatPercent(remaining)} left`);
	if (used !== undefined) parts.push(`${formatPercent(used)} used`);
	if (typeof window.resetAt === "number" && Number.isFinite(window.resetAt)) {
		parts.push(`resets ${formatResetTime(window.resetAt, now)} (${formatLocalTime(window.resetAt)})`);
	}
	return `${window.label}: ${parts.join(" · ") || "unavailable"}`;
}

function isCodexCredentialError(error: string | undefined): boolean {
	return Boolean(
		error &&
			/resolve Codex credentials|resolve a Codex OAuth access token|Pi-managed OAuth credentials|required account metadata/i.test(error),
	);
}

function getCodexDetailLevel(
	providerMatch: boolean,
	snapshot: LimitSnapshot | undefined,
	lastError: string | undefined,
): "info" | "warning" | "error" {
	if (lastError && !snapshot && providerMatch) return "error";
	if (snapshot?.stale || lastError || !providerMatch) return "warning";
	return "info";
}

function buildCodexLimitDetails(ctx: ExtensionContext, state: LimitTrackingState, now = Date.now()) {
	const provider = ctx.model?.provider ?? "none";
	const providerMatch = codexTracker.matchesProvider(provider);
	const cacheKey = providerMatch ? getTrackerCacheKey(codexTracker.id, provider) : undefined;
	const snapshot = cacheKey ? state.snapshotByTracker.get(cacheKey) : undefined;
	const lastError = snapshot?.error ?? (cacheKey ? state.lastErrorByTracker.get(cacheKey) : undefined);
	const lastAttempt = cacheKey ? state.lastAttemptByTracker.get(cacheKey) : undefined;
	const lines = [
		"Codex subscription limit status",
		`Model: ${ctx.model?.id ?? "none"}`,
		`Provider: ${provider}`,
		`Codex match: ${providerMatch ? "yes" : "no"}`,
	];

	if (snapshot?.accountLabel) lines.push(`Account: ${snapshot.accountLabel}`);
	lines.push(`${providerMatch ? "Snapshot" : "Cached snapshot"}: ${snapshot ? (snapshot.stale ? "stale" : "fresh") : "unavailable"}`);
	if (snapshot) {
		lines.push(`Fetched: ${formatSnapshotAge(snapshot, now)} ago`);
		lines.push(`Stale: ${snapshot.stale ? `yes (${formatSnapshotAge(snapshot, now)} old)` : "no"}`);
		if (snapshot.windows.length > 0) {
			lines.push("Windows:");
			for (const window of snapshot.windows) lines.push(`- ${formatWindowDetails(window, now)}`);
		}
	} else {
		lines.push("Fetched: unavailable");
		lines.push("Stale: n/a");
	}
	if (!snapshot && lastAttempt) lines.push(`Last attempt: ${formatDurationShort(now - lastAttempt)} ago`);
	lines.push(`Last error: ${lastError ?? "none"}`);
	if (CODEX_DASHBOARD_URL) lines.push(`Dashboard: ${CODEX_DASHBOARD_URL}`);
	if (providerMatch && isCodexCredentialError(lastError)) {
		lines.push(
			"",
			"Pi could not resolve Codex OAuth credentials.",
			"Try `/login openai-codex` or select the ChatGPT Plus/Pro Codex login from `/login`.",
		);
	}

	return {
		text: lines.join("\n"),
		level: getCodexDetailLevel(providerMatch, snapshot, lastError),
	};
}

export default function limitTrackingFooter(pi: ExtensionAPI) {
	const state = createLimitTrackingState();

	const syncActiveTracker = (provider: string | undefined) => {
		state.activeProvider = provider;
		state.activeTracker = findTracker(provider);
	};

	const renderCurrentStatus = (ctx: ExtensionContext) => {
		if (!state.sessionActive || !state.activeTracker) {
			clearFooterStatus(ctx);
			return;
		}
		const cacheKey = getTrackerCacheKey(state.activeTracker.id, state.activeProvider);
		renderFooterStatus(ctx, state.snapshotByTracker.get(cacheKey));
	};

	const refreshForCurrentModel = async (
		ctx: ExtensionContext,
		options: { force?: boolean; reason?: string } = {},
	): Promise<LimitSnapshot | null> => {
		if (!state.sessionActive) return null;

		syncActiveTracker(ctx.model?.provider);
		const tracker = state.activeTracker;
		const providerId = state.activeProvider;
		if (!tracker || !providerId) {
			clearFooterStatus(ctx);
			return null;
		}
		const cacheKey = getTrackerCacheKey(tracker.id, providerId);

		const previousSnapshot = state.snapshotByTracker.get(cacheKey);
		const lastAttempt = state.lastAttemptByTracker.get(cacheKey) ?? 0;
		if (!options.force && Date.now() - lastAttempt < CACHE_TTL_MS) {
			renderCurrentStatus(ctx);
			return previousSnapshot ?? null;
		}

		const inFlight = state.inFlightRefresh.get(cacheKey);
		if (inFlight) return inFlight;

		const refreshPromise = (async () => {
			state.lastAttemptByTracker.set(cacheKey, Date.now());

			const nextSnapshot = await tracker.fetchSnapshot(ctx, { force: options.force });
			const sameProvider = nextSnapshot.providerId === providerId;
			if (sameProvider && hasRenderableSnapshot(nextSnapshot) && !nextSnapshot.error) {
				state.snapshotByTracker.set(cacheKey, { ...nextSnapshot, stale: false });
				state.lastErrorByTracker.delete(cacheKey);
				if (state.sessionActive) renderCurrentStatus(ctx);
				return nextSnapshot;
			}

			const failure = sameProvider ? nextSnapshot.error ?? "Unable to refresh limit status" : "Limit response provider did not match the active provider";
			state.lastErrorByTracker.set(cacheKey, failure);

			if (hasRenderableSnapshot(previousSnapshot)) {
				const staleSnapshot: LimitSnapshot = { ...previousSnapshot, stale: true, error: failure };
				state.snapshotByTracker.set(cacheKey, staleSnapshot);
				if (state.sessionActive) renderCurrentStatus(ctx);
				return staleSnapshot;
			}

			state.snapshotByTracker.delete(cacheKey);
			if (state.sessionActive) clearFooterStatus(ctx);
			return null;
		})().finally(() => {
			state.inFlightRefresh.delete(cacheKey);
		});

		state.inFlightRefresh.set(cacheKey, refreshPromise);
		return refreshPromise;
	};

	pi.registerCommand("codex-limits", {
		description: "Show Codex subscription limit status",
		getArgumentCompletions: (prefix) => {
			const value = prefix.trim().toLowerCase();
			return CODEX_LIMITS_REFRESH_ARG.startsWith(value)
				? [{ value: CODEX_LIMITS_REFRESH_ARG, label: CODEX_LIMITS_REFRESH_ARG }]
				: null;
		},
		handler: async (args, ctx) => {
			const command = args.trim().toLowerCase();
			if (command && command !== CODEX_LIMITS_REFRESH_ARG) {
				ctx.ui.notify("Usage: /codex-limits [refresh]", "warning");
				return;
			}
			if (command === CODEX_LIMITS_REFRESH_ARG) {
				await refreshForCurrentModel(ctx, { force: true, reason: "manual" });
			}
			const detail = buildCodexLimitDetails(ctx, state);
			ctx.ui.notify(detail.text, detail.level);
		},
	});

	pi.on("session_start", async (event, ctx) => {
		state.sessionActive = true;
		registerTracker(codexTracker);
		syncActiveTracker(ctx.model?.provider);

		if (state.refreshTimer) clearInterval(state.refreshTimer);
		await refreshForCurrentModel(ctx, {
			force: event.reason === "reload",
			reason: event.reason === "reload" ? "reload" : "startup",
		});
		renderCurrentStatus(ctx);
		state.refreshTimer = setInterval(() => {
			void refreshForCurrentModel(ctx, { reason: "interval" });
		}, REFRESH_INTERVAL_MS);
	});

	pi.on("model_select", async (event, ctx) => {
		syncActiveTracker(event.model.provider);
		if (!state.activeTracker) {
			clearFooterStatus(ctx);
			return;
		}
		await refreshForCurrentModel(ctx, { reason: "model_select" });
		renderCurrentStatus(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		await refreshForCurrentModel(ctx, { force: true, reason: "turn_end" });
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		state.sessionActive = false;
		if (state.refreshTimer) {
			clearInterval(state.refreshTimer);
			state.refreshTimer = undefined;
		}
		clearFooterStatus(ctx);
	});
}
