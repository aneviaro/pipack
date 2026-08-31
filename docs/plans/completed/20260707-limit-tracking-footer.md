# Limit Tracking Footer Implementation Plan

## Overview
Build a local Pi extension that adds a compact Codex subscription-limit footer segment, backed by an extensible tracker registry and a provider-specific `/codex-limits` detail command. The implementation should use Pi's existing extension/status APIs so it augments the current footer instead of replacing unrelated footer content.

## Source Spec
- Spec: `docs/limit-tracking-footer-spec.md`
- Status: Draft
- Last reviewed: 2026-07-07

## Repository Context
- `docs/limit-tracking-footer-spec.md` — source behavior, contracts, UX, and manual test expectations.
- `README.md` — documents this repo as a `~/.pi` backup and warns that `agent/auth.json` contains live OAuth/API tokens that must never be committed or read casually.
- `.gitignore` — allowlist policy; `agent/extensions/**` is already tracked, but `docs/**` is not currently allowlisted.
- `agent/settings.json` — default provider is `openai-codex`, so the extension should work for the user's normal Pi model path.
- `agent/extensions/ask-user-question.ts` — local extension style: single TypeScript module, imports `ExtensionAPI`, uses `registerTool`, semantic theme colors, and no build step.
- `/Users/alex/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` — extension lifecycle, `session_start`, `model_select`, `session_shutdown`, `registerCommand`, and `ctx.model`/`ctx.modelRegistry` APIs.
- `/Users/alex/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md` — footer/status APIs; prefer `ctx.ui.setStatus("codex-limits", ...)` for a persistent footer segment instead of replacing the full footer with `setFooter`.
- `/Users/alex/.local/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/status-line.ts` — minimal persistent footer status pattern.
- `/Users/alex/.local/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/model-status.ts` — `model_select` event pattern for active model/provider changes.
- `/Users/alex/.local/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/custom-footer.ts` — confirms full-footer replacement exists but is heavier and should be avoided for this v1.
- `/Users/alex/.local/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/model-registry.d.ts` — `ctx.modelRegistry.getApiKeyAndHeaders(model)`, `getApiKeyForProvider(provider)`, and `isUsingOAuth(model)` are available for credential-safe auth resolution.
- `/Users/alex/.local/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/auth-storage.d.ts` — `AuthStorage` can refresh OAuth credentials; implementation should use registry APIs rather than reading `agent/auth.json` directly.
- `/Users/alex/.local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js` — Codex request headers require bearer token, `chatgpt-account-id` extracted from the OAuth JWT claim `https://api.openai.com/auth.chatgpt_account_id`, `originator: pi`, and a Pi-style user agent.

## Implementation Constraints
- Extension runtime is TypeScript via Pi/jiti; no repository build system or test runner currently exists.
- Place the extension at `agent/extensions/limit-tracking-footer.ts` unless implementation size forces `agent/extensions/limit-tracking-footer/index.ts` plus helper modules.
- Start session-scoped timers only from `session_start`; clear them from `session_shutdown`. Do not start long-lived timers in the extension factory.
- Use `ctx.ui.setStatus("codex-limits", text)` to append a footer segment through Pi's default footer. Clear it with `undefined` for unsupported providers or no usable snapshot.
- Use Pi theme semantic colors: `success` for `> 50%`, `warning` for `20–50%`, `error` for `< 20%`, `muted`/`dim` for stale age and secondary text.
- Never log or display OAuth access tokens, refresh tokens, raw account IDs, authorization headers, or `agent/auth.json` contents.
- Resolve Codex auth through `ctx.modelRegistry.getApiKeyAndHeaders(ctx.model)` so Pi owns OAuth refresh and configured headers.
- Match only active Codex subscription-backed models: provider IDs matching `^openai-codex(?:[-_]?[0-9]+)?$` and `ctx.modelRegistry.isUsingOAuth(ctx.model) === true` when available.
- Cache successful snapshots in memory only. No migration or persisted cache is required.
- Enforce a 60-second minimum cache TTL and a 5-minute background refresh interval.
- Keep provider-specific parsing isolated behind the `LimitTracker` interface so later providers do not touch footer rendering.

## Assumptions
- The v1 footer can use `setStatus` rather than `setFooter`; this best preserves existing footer content and matches Pi's documented persistent-status pattern.
- The Codex usage endpoint/schema is not defined in the spec. The implementation will encapsulate endpoint URL, headers, and response normalization in the Codex tracker and guard it with fixture-based parser tests/manual mock verification.
- Account label is optional; if a safe email/profile claim is unavailable from the access token or usage response, omit it instead of exposing account IDs.
- `/codex-limits refresh` is the manual refresh form; `/codex-limits` without args shows current detail and uses cache unless no snapshot exists.

## Non-goals
- Implementing non-Codex providers.
- Publishing a Pi package or adding package installation metadata.
- Persisting limit history across Pi restarts.
- Displaying raw token counts unless the Codex API reliably returns them in the usage response.
- Replacing Pi's entire footer or implementing a custom full footer renderer.

## Task Summary
1. Add extension shell, tracker contracts, registry, and pure formatting/cache helpers.
2. Implement Codex auth, usage fetch, and normalization behind a `LimitTracker`.
3. Wire refresh orchestration to Pi lifecycle/model events and render the footer status.
4. Add `/codex-limits` detail/manual-refresh command and complete manual verification notes.

## Implementation Tasks

### Task 1: Create tracker contracts and formatting helpers

Goal: Establish the extension-local architecture and pure helper functions without making network calls.

Context:
- The spec defines `LimitWindow`, `LimitSnapshot`, and `LimitTracker`; use those shapes directly and keep them exported for future provider reuse.
- Pi auto-discovers `agent/extensions/*.ts`, and existing local extension code uses a single exported default `function (pi: ExtensionAPI)`.
- Footer status rendering should consume normalized snapshots only; no Codex-specific data should leak into rendering helpers.

Files:
- Create: `agent/extensions/limit-tracking-footer.ts` — extension entrypoint, contracts, registry, formatting, color thresholds, cache state skeleton.
- Optional Create: `agent/extensions/limit-tracking-footer.test.mjs` — lightweight Node assertions for pure helpers if implementation exports them in a testable way.

Steps:
- [ ] Define `LimitWindow`, `LimitSnapshot`, `LimitTracker`, and an in-memory tracker registry with `registerTracker()` and `findTracker(provider)` helpers.
- [ ] Add constants for `CACHE_TTL_MS = 60_000`, `REFRESH_INTERVAL_MS = 300_000`, and status key `codex-limits`.
- [ ] Implement pure helpers for `remainingPercent`, color bucket selection, age formatting, reset-time formatting, stale suffix formatting, and compact footer text assembly.
- [ ] Ensure threshold boundaries match the spec exactly: `51` green/success, `50` yellow/warning, `20` yellow/warning, `19` red/error.
- [ ] Keep helper inputs provider-agnostic; helpers accept a `LimitSnapshot` and a Pi theme object/style callbacks, not Codex response payloads.

Verification:
- `node -e "console.log('manual pure-helper assertions: verify 51/50/20/19 color buckets and compact text in agent/extensions/limit-tracking-footer.ts')"`
- Manual check: review helper output strings include `Codex 5h 42% left · 7d 81% left` shape and append `stale 9m` only when `snapshot.stale` is true.

Completion criteria:
- Contracts mirror the spec and are exported or locally reusable.
- Color and text helpers are deterministic and do not depend on active Pi context except theme styling.
- No OAuth, account, or network code exists in generic footer rendering helpers.

### Task 2: Implement the Codex limit tracker

Goal: Fetch Codex subscription usage with Pi-managed OAuth credentials and normalize it into `LimitSnapshot`.

Context:
- `ctx.modelRegistry.getApiKeyAndHeaders(ctx.model)` resolves API auth and refreshes OAuth without directly reading `agent/auth.json`.
- Pi's Codex Responses implementation sends `Authorization: Bearer <token>`, `chatgpt-account-id`, `originator: pi`, and a Pi-style `User-Agent`; duplicate that header pattern for the usage endpoint without logging values.
- The source spec requires Codex provider matching for `openai-codex` and numbered variants and only for subscription-backed active providers.

Files:
- Modify: `agent/extensions/limit-tracking-footer.ts` — add Codex tracker registration, credential resolution, header construction, usage response parsing, and normalization.
- Optional Test: `agent/extensions/limit-tracking-footer.test.mjs` — fixture tests for Codex response parsing and `usedPercent` to `remainingPercent` conversion.

Steps:
- [ ] Implement `codexTracker.matchesProvider(provider)` using `^openai-codex(?:[-_]?[0-9]+)?$` and an additional active-model OAuth check before fetch.
- [ ] Resolve auth with `ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!)`; if no auth exists, return a failed state that hides the footer but is visible in `/codex-limits`.
- [ ] Decode only non-secret JWT claims needed for request/account metadata: `https://api.openai.com/auth.chatgpt_account_id` for the header and optional email/profile fields for `accountLabel`.
- [ ] Add a single `CODEX_USAGE_URL` constant and a `fetchCodexUsage()` helper; keep all endpoint/schema assumptions isolated there.
- [ ] Normalize Codex response windows into exactly two preferred windows: `5h` and `7d` labels, preserving reset times when present.
- [ ] Convert `usedPercent` to `remainingPercent = max(0, min(100, 100 - usedPercent))`; prefer an explicit remaining percentage if the API provides one.
- [ ] Sanitize errors before storing in `LimitSnapshot.error` or command output; strip bearer tokens, account IDs, long JWT-looking strings, and authorization headers.

Verification:
- Manual mocked fetch check: temporarily inject a fixture payload returning 58% used for 5h and 19% used for weekly, run `/reload`, select an `openai-codex` model, and verify footer shows `5h 42% left · 7d 81% left`.
- Manual missing-credential check: run Pi without Codex auth or temporarily choose a non-auth Codex test model and verify footer is hidden while `/codex-limits` explains missing auth without secrets.

Completion criteria:
- The tracker returns provider-agnostic `LimitSnapshot` objects only.
- Successful snapshots include two windows, `fetchedAt`, provider ID/label, and optional safe account label.
- Failed fetches never expose tokens/account IDs and leave previous successful snapshots available for stale display.

### Task 3: Wire refresh lifecycle and footer status rendering

Goal: Keep the footer current for supported active providers while avoiding background API hammering.

Context:
- Pi docs require long-lived timers to start from `session_start` and be cleaned up during `session_shutdown`.
- `model_select` fires on `/model`, Ctrl+P cycling, and session restore; it is the correct trigger for active provider reevaluation.
- Unsupported active providers should clear the status immediately and must not display stale Codex data.

Files:
- Modify: `agent/extensions/limit-tracking-footer.ts` — add session lifecycle handlers, refresh orchestration, cache TTL enforcement, and `ctx.ui.setStatus` rendering.

Steps:
- [ ] Maintain state `{ activeProvider, activeTracker, snapshotByTracker, lastAttemptByTracker, lastErrorByTracker, inFlightRefresh }` in extension memory.
- [ ] Implement `refreshForCurrentModel(ctx, { force, reason })` that no-ops for unsupported providers, respects the TTL unless forced, and deduplicates concurrent refreshes.
- [ ] On `session_start`, register the Codex tracker, evaluate `ctx.model`, refresh once, render current status, and start a 5-minute interval that calls the same refresh path.
- [ ] On `model_select`, immediately clear unsupported providers or refresh/render the newly matched tracker.
- [ ] On refresh failure with an existing snapshot, mark it stale, preserve it, add compact age text, and render stale status.
- [ ] On refresh failure without a prior snapshot, clear the footer status and store the sanitized error for `/codex-limits`.
- [ ] On `session_shutdown`, clear the interval and remove the footer status.

Verification:
- Manual TTL check: trigger startup refresh, run `/codex-limits refresh` twice within 60 seconds, and confirm only the forced command bypasses the TTL while background refreshes do not hammer the API.
- Manual provider switch check: switch from `openai-codex` to a non-Codex provider and confirm `ctx.ui.setStatus("codex-limits", undefined)` clears the segment.

Completion criteria:
- Footer is visible only for supported active Codex subscription providers.
- Background refresh interval is exactly one session-scoped timer and is cleaned up on shutdown/reload.
- Stale snapshots remain visible with an age marker only for the same supported active provider.

### Task 4: Add `/codex-limits` details and verification notes

Goal: Provide a provider-specific detail command with manual refresh and safe diagnostics.

Context:
- Pi commands are registered with `pi.registerCommand("name", { description, handler })` and can use `ctx.ui.notify`, `ctx.ui.custom`, or displayed custom messages for user-visible output.
- The command must show active provider match status, account label when safe, both windows, reset times, last fetch age, stale/error state, dashboard URL if available, and missing-credential guidance.

Files:
- Modify: `agent/extensions/limit-tracking-footer.ts` — add `/codex-limits` command, optional argument completions for `refresh`, and detail rendering.
- Optional Modify: `docs/limit-tracking-footer-spec.md` — only if implementation discovers a concrete Codex usage endpoint/schema caveat worth documenting back into the spec.

Steps:
- [ ] Register `/codex-limits` with description `Show Codex subscription limit status` and optional completion for `refresh`.
- [ ] Parse args so `/codex-limits refresh` calls `refreshForCurrentModel(ctx, { force: true, reason: "manual" })` before rendering details.
- [ ] Render detail output in a compact modal or notification-safe text block; include active model/provider, match status, safe account label/email, each window's used/remaining percentages, reset time, fetched age, stale state, last sanitized error, and dashboard URL if known.
- [ ] For missing credentials, explain that Pi could not resolve Codex OAuth credentials and suggest `/login openai-codex` or selecting the ChatGPT Plus/Pro Codex login from `/login`.
- [ ] Add a short comment near the command/error formatter stating that tokens, account IDs, and headers must not be included in user-visible output.
- [ ] Run through the spec's manual cases and record any endpoint/schema assumptions as comments or documentation.

Verification:
- `pi -e agent/extensions/limit-tracking-footer.ts --list-models openai-codex`
- Manual TUI check: run `pi`, `/reload`, `/codex-limits`, `/codex-limits refresh`, switch to a non-Codex model, and re-run `/codex-limits`.

Completion criteria:
- `/codex-limits` works whether the footer is visible, stale, hidden due to unsupported provider, or hidden due to missing credentials.
- Manual refresh updates the footer on success and stores a sanitized last error on failure.
- Command output contains no bearer tokens, refresh tokens, raw account IDs, or private credential material.

## Cross-Task Verification
- `pi -e agent/extensions/limit-tracking-footer.ts --list-models openai-codex`
- Manual: `/reload` in Pi shows no startup errors.
- Manual: non-Codex active provider hides the footer segment.
- Manual: Codex active provider plus mocked usage response renders both `5h` and `7d` windows.
- Manual: thresholds at `51%`, `50%`, `20%`, and `19%` use success/warning/warning/error semantic colors respectively.
- Manual: fetch failure with prior snapshot keeps stale status with age; fetch failure without snapshot hides the footer and shows the error only in `/codex-limits`.
- Manual/security: command output, logs, and comments do not print OAuth tokens, raw account IDs, or authorization headers.

## Risks and Mitigations
- Risk: Codex usage endpoint/schema may change or differ from Codex Responses streaming APIs.
  Mitigation: isolate endpoint and normalization in the Codex tracker; keep fixture/manual mock checks for parser behavior and fail closed by hiding the footer when no prior snapshot exists.
- Risk: Full-footer replacement could conflict with other extensions.
  Mitigation: use `ctx.ui.setStatus` so Pi's default footer composes the segment with other extension statuses.
- Risk: Timers can survive reload and continue making API calls.
  Mitigation: create timers only in `session_start`, store the interval handle, and clear it in `session_shutdown`.
- Risk: Credentials or account identifiers could leak through errors or details.
  Mitigation: use model registry auth resolution, never read `agent/auth.json` directly, and sanitize all errors before storage/display.

## Open Questions
- None for v1 planning. The Codex usage endpoint/schema remains an implementation assumption to isolate and verify, not a product decision.
