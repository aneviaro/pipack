import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
	CACHE_TTL_MS,
	CODEX_FETCH_TIMEOUT_MS,
	REFRESH_INTERVAL_MS,
	codexTracker,
	default as limitTrackingFooter,
	fetchCodexUsage,
	formatCompactFooter,
	getRemainingColor,
	normalizeCodexUsageResponse,
	sanitizeCodexError,
	type LimitStatusStyles,
} from "../extensions/codex-limit-tracking-footer.ts";

const fixture = JSON.parse(
	readFileSync(new URL("./fixtures/codex-usage.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

const styles: LimitStatusStyles = {
	text: (value) => value,
	success: (value) => `<success>${value}</success>`,
	warning: (value) => `<warning>${value}</warning>`,
	error: (value) => `<error>${value}</error>`,
	muted: (value) => `<muted>${value}</muted>`,
	dim: (value) => `<dim>${value}</dim>`,
};

function encodeBase64Url(value: string): string {
	return Buffer.from(value).toString("base64url");
}

function fixtureToken(accountId = "fixture-account-123456"): string {
	const header = encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
	const payload = encodeBase64Url(JSON.stringify({
		email: "fixture-user@example.test",
		"https://api.openai.com/auth": { chatgpt_account_id: accountId },
	}));
	return `${header}.${payload}.fixture-signature`;
}

type TestUi = {
	setStatus?: (key: string, value: string | undefined) => void;
	notify?: (text: string, level: string) => void;
};

function makeContext(provider = "openai-codex", auth: Record<string, unknown> = {}, ui: TestUi = {}): any {
	const model = { provider, id: "fixture-model" };
	return {
		model,
		modelRegistry: {
			isUsingOAuth: () => auth.oauth !== false,
			getApiKeyAndHeaders: async () => auth,
		},
		ui: {
			theme: { fg: (_color: string, value: string) => value },
			setStatus: ui.setStatus ?? (() => undefined),
			notify: ui.notify ?? (() => undefined),
		},
	};
}

function withFetch(mock: typeof fetch): () => void {
	const original = globalThis.fetch;
	globalThis.fetch = mock;
	return () => {
		globalThis.fetch = original;
	};
}

test("normalizes the documented Codex fixture and reset timestamps", () => {
	const snapshot = normalizeCodexUsageResponse(fixture, "openai-codex", undefined, 1_700_000_000_000);
	assert.equal(snapshot.providerLabel, "Codex");
	assert.equal(snapshot.accountLabel, "fixture-user@example.test");
	assert.deepEqual(snapshot.windows.map(({ id, remainingPercent, usedPercent }) => ({ id, remainingPercent, usedPercent })), [
		{ id: "5h", remainingPercent: 42, usedPercent: 58 },
		{ id: "7d", remainingPercent: 81, usedPercent: 19 },
	]);
	assert.equal(snapshot.windows[0]?.resetAt, 4_102_444_800_000);
});

test("discovers fallback windows, accepts weekly-only payloads, and rejects incomplete payloads", () => {
	const fallback = {
		limits: [
			{ name: "rolling 5 hour", used: 2, limit: 4 },
			{ name: "weekly", used: 19, limit: 100 },
		],
	};
	const snapshot = normalizeCodexUsageResponse(fallback, "openai-codex", undefined, 1_700_000_000_000);
	assert.deepEqual(snapshot.windows.map((window) => window.remainingPercent), [50, 81]);

	const weeklyOnly = {
		email: "fixture-user@example.test",
		rate_limit: {
			primary_window: {
				used_percent: 1,
				limit_window_seconds: 604_800,
				reset_after_seconds: 603_715,
				reset_at: 1_784_554_739,
			},
			secondary_window: null,
		},
	};
	const weeklySnapshot = normalizeCodexUsageResponse(weeklyOnly, "openai-codex", undefined, 1_700_000_000_000);
	assert.equal(weeklySnapshot.accountLabel, "fixture-user@example.test");
	assert.deepEqual(weeklySnapshot.windows.map(({ id, remainingPercent, usedPercent }) => ({ id, remainingPercent, usedPercent })), [
		{ id: "7d", remainingPercent: 99, usedPercent: 1 },
	]);

	assert.throws(
		() => normalizeCodexUsageResponse({ rate_limit: { primary_window: { used_percent: 1 } } }),
		/recognizable limit windows/,
	);
});

test("uses the specified threshold buckets and renders an unprefixed stale footer", () => {
	assert.equal(getRemainingColor(51), "success");
	assert.equal(getRemainingColor(50), "warning");
	assert.equal(getRemainingColor(20), "warning");
	assert.equal(getRemainingColor(19), "error");
	const snapshot = {
		providerId: "openai-codex",
		providerLabel: "Codex",
		windows: [
			{ id: "5h", label: "5h", remainingPercent: 42 },
			{ id: "7d", label: "7d", remainingPercent: 81 },
		],
		fetchedAt: 1_700_000_000_000,
		stale: true,
	};
	const footer = formatCompactFooter(snapshot, styles, 1_700_000_540_000) ?? "";
	assert.match(footer, /^<warning>5h 42% left<\/warning>/);
	assert.doesNotMatch(footer, /Codex/);
	assert.match(footer, /stale/);
	assert.equal(formatCompactFooter({ ...snapshot, windows: [] }, styles), undefined);
});

test("matches only supported Codex providers", () => {
	assert.equal(codexTracker.matchesProvider("openai-codex"), true);
	assert.equal(codexTracker.matchesProvider("openai-codex-2"), true);
	assert.equal(codexTracker.matchesProvider("openai-codex_3"), true);
	assert.equal(codexTracker.matchesProvider("openai"), false);
});

test("keeps errors sanitized and enforces a fetch timeout", async () => {
	const token = fixtureToken();
	const error = sanitizeCodexError(new Error(`Bearer ${token} chatgpt-account-id=${"fixture-account-123456"}`));
	assert.equal(error.includes(token), false);
	assert.equal(error.includes("fixture-account-123456"), false);

	const restore = withFetch((_input, init) => new Promise((_resolve, reject) => {
		init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
	}));
	try {
		await assert.rejects(fetchCodexUsage(new Headers(), { timeoutMs: 5 }), /timed out/);
	} finally {
		restore();
	}
	assert.equal(CODEX_FETCH_TIMEOUT_MS, 15_000);

	const privatePayload = "private-upstream-payload@example.test";
	const restoreErrorResponse = withFetch(async () => new Response(privatePayload, { status: 503 }));
	try {
		await assert.rejects(fetchCodexUsage(new Headers()), (error: Error) => {
			assert.equal(error.message, "Codex usage request failed (503)");
			assert.equal(error.message.includes(privatePayload), false);
			return true;
		});
	} finally {
		restoreErrorResponse();
	}
});

test("uses Pi-managed OAuth auth and sends Codex request headers", async () => {
	const token = fixtureToken();
	let requestHeaders: Headers | undefined;
	const restore = withFetch(async (_input, init) => {
		requestHeaders = new Headers(init?.headers);
		return new Response(JSON.stringify(fixture), { status: 200, headers: { "content-type": "application/json" } });
	});
	try {
		const snapshot = await codexTracker.fetchSnapshot(makeContext("openai-codex", { ok: true, apiKey: token, headers: {} }));
		assert.equal(snapshot.error, undefined);
		assert.equal(requestHeaders?.get("originator"), "pi");
		assert.equal(requestHeaders?.get("chatgpt-account-id"), "fixture-account-123456");
		assert.equal(requestHeaders?.get("authorization")?.startsWith("Bearer "), true);
	} finally {
		restore();
	}
});

test("reports missing OAuth credentials without exposing auth material", async () => {
	const secret = fixtureToken();
	const snapshot = await codexTracker.fetchSnapshot(makeContext("openai-codex", { ok: false, error: `credential ${secret}` }));
	assert.equal(snapshot.windows.length, 0);
	assert.equal(snapshot.error?.includes(secret), false);
	assert.match(snapshot.error ?? "", /resolve Codex credentials/);
});

test("deduplicates refreshes, isolates provider state, forces refreshes, and cleans up", async () => {
	assert.equal(CACHE_TTL_MS, 15_000);
	assert.equal(REFRESH_INTERVAL_MS, 60_000);

	const token = fixtureToken();
	const providerBFixture = structuredClone(fixture) as any;
	providerBFixture.rate_limit.primary_window.used_percent = 10;
	let requests = 0;
	const privatePayload = "private-provider-error@example.test";
	const restoreFetch = withFetch(async () => {
		requests += 1;
		if (requests === 3) return new Response(privatePayload, { status: 503 });
		const payload = requests === 2 ? providerBFixture : fixture;
		return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
	});

	const originalSetInterval = globalThis.setInterval;
	const originalClearInterval = globalThis.clearInterval;
	let intervalDelay: number | undefined;
	let cleared = false;
	(globalThis as any).setInterval = (_handler: Function, delay: number) => {
		intervalDelay = delay;
		return { timer: true };
	};
	(globalThis as any).clearInterval = () => {
		cleared = true;
	};

	const statuses = new Map<string, Array<string | undefined>>();
	const notifications = new Map<string, string[]>();
	const context = (provider: string, key: string) => makeContext(
		provider,
		{ ok: true, apiKey: token, headers: {} },
		{
			setStatus: (_statusKey, value) => statuses.set(key, [...(statuses.get(key) ?? []), value]),
			notify: (text) => notifications.set(key, [...(notifications.get(key) ?? []), text]),
		},
	);

	try {
		const handlers = new Map<string, Function>();
		const commands = new Map<string, Function>();
		const pi: any = {
			on: (event: string, handler: Function) => handlers.set(event, handler),
			registerCommand: (name: string, definition: { handler: Function }) => commands.set(name, definition.handler),
		};
		limitTrackingFooter(pi);

		const ctxA = context("openai-codex", "a");
		await handlers.get("session_start")?.({ reason: "startup" }, ctxA);
		assert.equal(requests, 1);
		assert.equal(intervalDelay, REFRESH_INTERVAL_MS);
		assert.match(statuses.get("a")?.at(-1) ?? "", /^5h 42% left/);
		assert.doesNotMatch(statuses.get("a")?.at(-1) ?? "", /Codex/);

		await handlers.get("model_select")?.({ model: ctxA.model }, ctxA);
		assert.equal(requests, 1, "same-provider refresh should use the TTL cache");

		const ctxB = context("openai-codex-2", "b");
		await handlers.get("model_select")?.({ model: ctxB.model }, ctxB);
		assert.equal(requests, 2);
		assert.match(statuses.get("b")?.at(-1) ?? "", /^5h 90% left/);
		assert.doesNotMatch(statuses.get("b")?.at(-1) ?? "", /42%/);

		await commands.get("codex-limits")?.("refresh", ctxB);
		assert.equal(requests, 3, "manual refresh should bypass the TTL cache");
		assert.match(statuses.get("b")?.at(-1) ?? "", /^5h 90% left.*stale/);
		assert.match(notifications.get("b")?.at(-1) ?? "", /Codex usage request failed \(503\)/);
		assert.doesNotMatch(notifications.get("b")?.at(-1) ?? "", new RegExp(privatePayload));

		const unsupportedCtx = context("openai", "unsupported");
		await handlers.get("model_select")?.({ model: unsupportedCtx.model }, unsupportedCtx);
		assert.equal(requests, 3);
		assert.equal(statuses.get("unsupported")?.at(-1), undefined);

		await handlers.get("model_select")?.({ model: ctxA.model }, ctxA);
		assert.equal(requests, 3, "returning to a provider should reuse only that provider's cache");
		assert.match(statuses.get("a")?.at(-1) ?? "", /^5h 42% left/);
		assert.doesNotMatch(statuses.get("a")?.at(-1) ?? "", /90%/);

		assert.equal(handlers.has("turn_end"), true);
		await handlers.get("turn_end")?.({}, ctxA);
		assert.equal(requests, 4, "turn_end should force a refresh");

		await handlers.get("session_shutdown")?.({}, ctxA);
		assert.equal(cleared, true);
		assert.equal(statuses.get("a")?.at(-1), undefined);
	} finally {
		globalThis.setInterval = originalSetInterval;
		globalThis.clearInterval = originalClearInterval;
		restoreFetch();
	}
});
