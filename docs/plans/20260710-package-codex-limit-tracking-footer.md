# Package Codex Limit Tracking Footer

## Overview
Promote the existing Codex subscription-limit footer from a global local extension into the npm-installable Pi package `@aneviaro/pi-codex-limit-tracking-footer`. Preserve its intentional runtime behavior, then add repeatable tests, package metadata, tarball validation, and a public npm release.

## Source Spec
- Spec: `docs/limit-tracking-footer-spec.md`
- Status: Assumed — the spec says local-only v1, but the user has now requested packaging.
- Last reviewed: 2026-07-10

## Readiness Assessment

### Ready
- `agent/extensions/limit-tracking-footer.ts` loads successfully with Pi 0.80.6.
- The extension has a clean Pi API boundary: a default extension factory, `setStatus` footer composition, lifecycle cleanup, a `/codex-limits` command, Pi-managed OAuth resolution, and sanitized diagnostics.
- Fixture-style execution verifies the current normalizer, threshold boundaries (51/50/20/19), compact rendering, and credential redaction.
- npm authentication is active as `aneviaro`; the proposed scoped package name is not currently published.

### Packaging release gaps
- The intentionally aggressive refresh cadence (15-second TTL, 60-second polling, and refresh after `turn_end`) and compact unprefixed footer text are accepted release behavior; retain them rather than changing them to match the older draft spec.
- Cache state is keyed only by tracker ID, so a snapshot may be reused across different matching provider IDs. Cache and render only a snapshot belonging to the active provider.
- The usage endpoint and response assumptions are isolated but not covered by committed fixtures, mocked fetch tests, or a live smoke test against a real Codex OAuth session.
- There is no package directory, manifest, README/license, test script, type-check script, tarball install test, or `.gitignore` allowlist for this new package.

## Repository Context
- `agent/extensions/limit-tracking-footer.ts` — current 839-line global extension; canonical source to migrate into the package.
- `docs/limit-tracking-footer-spec.md` — UX, refresh, OAuth, privacy, and test requirements.
- `packages/ask-user-question/package.json` — existing Pi package convention: scoped package name, `pi-package` keyword, explicit `files`, Pi manifest, and peer dependencies.
- `.gitignore` — allowlist policy; every file under `packages/codex-limit-tracking-footer/` needs an explicit opt-in.
- `README.md` — package inventory and bootstrap documentation to update after release.
- `agent/settings.json` — global Pi package configuration; add only the immutable published npm spec after the release, not a local absolute development path.
- `/Users/alex/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md` — Pi package manifest, peer dependency, and installation rules.
- `/Users/alex/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` — lifecycle, command, footer-status, and session resource rules.

## Implementation Constraints
- Keep the current no-runtime-dependency design. Declare Pi imports only as peer dependencies with `"*"` ranges; do not bundle Pi core packages.
- Keep package runtime code in `extensions/` and declare it explicitly in the `pi.extensions` manifest.
- Preserve the OAuth security boundary: use `ctx.modelRegistry.getApiKeyAndHeaders()`; never read `agent/auth.json`, log credentials, or publish fixtures with real identifiers.
- Use Node 20+ compatible APIs and declare the engine floor in the package manifest.
- Keep tests and development tooling out of the npm tarball through `files`; package installation omits dev dependencies.
- Do not retain both the global extension and installed package, which would register duplicate commands and footer status handlers.
- Do not commit the current unrelated `agent/settings.json` working-tree change. Make the release configuration update only after confirming its intended package entry.

## Assumptions
- Publish to npm under `@aneviaro/pi-codex-limit-tracking-footer` at version `0.1.0` with public access.
- The current `https://chatgpt.com/backend-api/wham/usage` contract remains the v1 source, but release requires a real-account smoke check and failure-safe behavior if it changes.
- The existing 15-second TTL, 60-second polling, forced post-turn refresh, and unprefixed compact footer are intentional and remain unchanged in the published package.
- MIT is the release license, consistent with a broadly reusable Pi package. Confirm the repository’s intended license before publishing if a different license file is added meanwhile.

## Non-goals
- Adding non-Codex trackers.
- Persisting snapshots, account data, or usage history.
- Publishing raw OAuth fixtures or integration credentials.
- Replacing Pi’s complete footer.
- Changing Pi core or its OAuth provider implementation.

## Task Summary
1. Create the canonical package structure and migrate the extension source.
2. Preserve intentional refresh/footer behavior while isolating provider cache state.
3. Add fixture-based tests, type checking, and package documentation.
4. Validate the tarball, publish the npm package, and switch this Pi setup to the immutable release.

## Implementation Tasks

### Task 1: Create the canonical Pi package

Goal: Make one package directory the sole distributable source of the extension.

Context:
- Pi loads package extension paths from `package.json`’s `pi.extensions` array.
- The current global extension must be removed once the package owns the source; loading both creates duplicate `/codex-limits` registrations.

Files:
- Create: `packages/codex-limit-tracking-footer/package.json` — package manifest, peer dependencies, engine floor, test/type-check scripts, and explicit published files.
- Create: `packages/codex-limit-tracking-footer/extensions/codex-limit-tracking-footer.ts` — migrated extension source.
- Create: `packages/codex-limit-tracking-footer/README.md` — install, behavior, OAuth/privacy, command, and troubleshooting documentation.
- Create: `packages/codex-limit-tracking-footer/LICENSE` — selected package license.
- Modify: `.gitignore` — allowlist `packages/codex-limit-tracking-footer/**`.
- Delete: `agent/extensions/limit-tracking-footer.ts` — avoid duplicate local loading after package migration.

Steps:
- [ ] Create `@aneviaro/pi-codex-limit-tracking-footer` at `0.1.0` with `pi-package`, Pi-related keywords, `engines.node`, explicit `files`, and `pi.extensions: ["./extensions/codex-limit-tracking-footer.ts"]`.
- [ ] Declare `@earendil-works/pi-coding-agent` as a `"*"` peer dependency; add only development dependencies necessary to type-check and run tests.
- [ ] Move the current extension implementation into the package extension path without changing externally visible command/status names.
- [ ] Add the package directory to the repository allowlist and remove the old global extension only when the package source is validated.
- [ ] Write install instructions for npm, a local path, and the `/codex-limits [refresh]` command; explicitly state that it reads Pi-managed Codex OAuth credentials and does not store usage data.

Verification:
- `cd packages/codex-limit-tracking-footer && npm pack --dry-run`
- `pi -e ./packages/codex-limit-tracking-footer --list-models openai-codex`

Completion criteria:
- The tarball contains the README, license, manifest, and exactly the intended extension source.
- Pi can discover the package extension without the old global source present.

### Task 2: Preserve refresh UX and isolate active-provider cache state

Goal: Keep the accepted refresh/footer UX unchanged while preventing stale or cross-provider footer data.

Context:
- `CACHE_TTL_MS = 15_000`, `REFRESH_INTERVAL_MS = 60_000`, and forced `turn_end` refresh are intentional package behavior, despite the older draft spec.
- Compact footer text intentionally starts with the two windows rather than a `Codex` prefix.
- Current tracker-only maps can reuse a Codex snapshot for a different matching provider ID.

Files:
- Modify: `packages/codex-limit-tracking-footer/extensions/codex-limit-tracking-footer.ts` — cache identity, scheduler, lifecycle, fetch cancellation, and compact footer rendering.
- Create: `packages/codex-limit-tracking-footer/test/fixtures/codex-usage.json` — sanitized representative usage response.

Steps:
- [ ] Preserve the existing 15-second TTL, 60-second interval, and forced post-turn refresh behavior through the package migration.
- [ ] Keep startup and model-select refreshes, but render an existing snapshot only when its `providerId` matches the active provider. Key attempts, in-flight work, errors, and snapshots by provider/tracker identity.
- [ ] Preserve the compact 5h/7d footer text, independent semantic colors, and stale age text without adding a provider-label prefix.
- [ ] Abort or time-bound usage fetches so a stalled request cannot accumulate or block a session; keep existing stale-snapshot-on-error semantics.
- [ ] Retain sanitized, bounded diagnostics and never put tokens, account IDs, auth headers, or raw payloads in errors, details, or test fixtures.

Verification:
- `npm test -- --test-name-pattern='refresh|provider|footer'`
- Manual Pi check: select a Codex model, switch to a non-Codex model, then to a different matching Codex provider; confirm no stale footer crosses provider boundaries.

Completion criteria:
- Package migration preserves the existing TTL, interval, and post-turn refresh cadence while retaining request deduplication.
- The compact unprefixed footer remains absent for unsupported providers.
- A failed refresh retains only same-provider stale data.

### Task 3: Add repeatable package quality gates

Goal: Replace manual-only confidence with fixture-driven tests and documented release checks.

Context:
- The current repository has no test runner or TypeScript configuration for this extension.
- The response parser is deliberately defensive; representative schema, fallback parsing, and malformed/error paths need regression coverage.

Files:
- Create: `packages/codex-limit-tracking-footer/test/limit-tracking-footer.test.ts` — Node test cases using mocked fetch/auth boundaries.
- Create: `packages/codex-limit-tracking-footer/test/fixtures/codex-usage.json` — sanitized success fixture.
- Create: `packages/codex-limit-tracking-footer/tsconfig.json` — no-emit type-check configuration.
- Create: `packages/codex-limit-tracking-footer/package-lock.json` — reproducible development dependency installation.
- Modify: `packages/codex-limit-tracking-footer/package.json` — `test`, `typecheck`, and package validation scripts.
- Modify: `packages/codex-limit-tracking-footer/README.md` — compatibility, endpoint caveat, rate behavior, and release verification steps.

Steps:
- [ ] Use a lightweight TypeScript test loader and Node’s test runner; keep it as a development-only dependency and exclude tests/config from the published `files` allowlist.
- [ ] Test normalization of the documented primary/secondary response, fallback window discovery, percent conversion/clamping, reset timestamps, and rejection when either required window is absent.
- [ ] Test rendering at 51%, 50%, 20%, and 19%; assert the `Codex` label, stale suffix, and absence of unsupported/empty snapshots.
- [ ] Mock auth and fetch to test OAuth/missing credential failures, request headers without exposing their values, timeouts, sanitized errors, TTL deduplication, manual force refresh, provider change isolation, and session timer cleanup.
- [ ] Run strict no-emit TypeScript checking against the Pi peer types used by the extension.

Verification:
- `cd packages/codex-limit-tracking-footer && npm ci && npm run typecheck && npm test`
- `cd packages/codex-limit-tracking-footer && npm pack --dry-run`

Completion criteria:
- Tests cover threshold, stale, missing-auth, unsupported-provider, provider-cache isolation, and intentional refresh-cadence behaviors without live credentials.
- Type checking and tests are reproducible from the package directory.

### Task 4: Validate, publish, and adopt the immutable npm release

Goal: Release a verified public package and make this backup install it by version.

Context:
- `npm whoami` currently resolves as `aneviaro`.
- npm package lookup found no existing `@aneviaro/pi-codex-limit-tracking-footer` release.
- This repository’s bootstrap flow restores `agent/settings.json`, so it should refer only to a published, immutable npm version.

Files:
- Modify: `agent/settings.json` — add `npm:@aneviaro/pi-codex-limit-tracking-footer@0.1.0` after successful publication.
- Modify: `README.md` — add the new package to the included-package inventory and installation/use documentation.
- Modify: `docs/limit-tracking-footer-spec.md` — change v1’s local-only/publish non-goal language to reflect the packaged release and document the final package name.

Steps:
- [ ] Run clean install, type check, test suite, `npm pack --dry-run`, and `npm pack`; inspect the tarball file list before publishing.
- [ ] In an isolated temporary Pi configuration, load the produced tarball/package and run `pi -e <package-path-or-tarball> --list-models openai-codex` to prove package discovery without relying on the global extension.
- [ ] Perform one interactive smoke test using a real Codex OAuth session: `/reload`, visible fresh footer, `/codex-limits`, manual refresh, non-Codex switch, stale failure path, and secret-free output inspection.
- [ ] Publish with `npm publish --access public`; use npm provenance only when the publishing identity/environment is configured to support it.
- [ ] Verify the registry artifact with `npm view @aneviaro/pi-codex-limit-tracking-footer@0.1.0 --json` and a clean `pi install npm:@aneviaro/pi-codex-limit-tracking-footer@0.1.0` smoke test.
- [ ] Update global Pi settings to the exact published version, update project docs/spec, commit the release metadata, and tag the repository release.

Verification:
- `npm view @aneviaro/pi-codex-limit-tracking-footer@0.1.0 version dist.tarball`
- `pi install npm:@aneviaro/pi-codex-limit-tracking-footer@0.1.0`
- Manual: `/codex-limits refresh` shows a safe, current status and the footer has one Codex segment.

Completion criteria:
- The public npm version is installable by Pi, contains no test/secrets/unintended files, and is pinned in this setup’s settings.
- A fresh bootstrap/Pi installation obtains the package without a local absolute path.

## Cross-Task Verification
- `cd packages/codex-limit-tracking-footer && npm ci && npm run typecheck && npm test && npm pack --dry-run`
- `pi -e ./packages/codex-limit-tracking-footer --list-models openai-codex`
- In Pi: `/reload`; `/codex-limits`; `/codex-limits refresh`; switch away from and back to Codex.
- `npm view @aneviaro/pi-codex-limit-tracking-footer@0.1.0 version dist.tarball`
- Inspect `git diff -- agent/settings.json` before committing so only the intentional package pin is included.

## Risks and Mitigations
- Risk: The undocumented Codex usage endpoint/schema changes.
  Mitigation: isolate parsing/fetching, fixture-test known shapes, use bounded sanitized failure handling, and verify live before publishing.
- Risk: The intentional rapid refresh cadence consumes limits or triggers upstream throttling.
  Mitigation: retain request deduplication and timeout handling, document the cadence clearly, and revisit it only if live use demonstrates an upstream problem.
- Risk: Global and package extension copies load simultaneously.
  Mitigation: migrate to one canonical package source and delete the global file before adding the package to settings.
- Risk: OAuth data leaks in a package fixture, log, or error.
  Mitigation: use fabricated fixtures, mock auth in tests, retain redaction tests, and inspect the tarball before publish.
- Risk: The npm scope is unavailable despite the authenticated user.
  Mitigation: run `npm publish --dry-run`/registry preflight before making settings or release commits; resolve scope ownership before publishing.

## Open Questions
- None. The plan assumes the proposed scoped npm name and MIT license; change them only if repository licensing policy requires it.
