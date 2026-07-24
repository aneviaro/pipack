# Safe RM No Manual Batching UX

## Overview
Update `@aneviaro/pi-safe-rm` so hard-cap and refusal messages never tell an agent to manually batch a directory-tree deletion. The current `tooManyEntriesMessage()` remediation can transform one intended safe deletion into a sequence of independently destructive child `rm -rf` commands. The fix is to make over-cap validation a clear non-authorization path, add model-facing guidance that child batching is forbidden, and document how this policy composes with the separate literal-directory bounded-summary plan.

## Source Spec
- Spec: `prompt: Never tell the agent to manually batch a directory tree`
- Related spec: `docs/pi-safe-rm-spec.md`
- Related plan: `docs/plans/20260724-remove-literal-directory-entry-cap.md`
- Status: Completed
- Last reviewed: 2026-07-24

## Repository Context
- `packages/safe-rm/extensions/safe-rm.ts` — Pi extension implementation; `tooManyEntriesMessage()` currently contains the prohibited “Delete smaller chunks in batches” instruction, and `registerTool()` owns the model-visible `validate_rm` prompt guidelines.
- `packages/safe-rm/test/safe-rm.test.ts` — Node test suite; the entry-cap test currently expects batching-oriented remediation text and should become a regression guard against it.
- `packages/safe-rm/README.md` — user-facing package behavior docs; should explain that over-cap exact validations are refused without suggesting child deletions.
- `docs/pi-safe-rm-spec.md` — product contract and UX notes; should record that manual batching must not be suggested as a workaround.
- `docs/plans/20260724-remove-literal-directory-entry-cap.md` — separate implementation plan for approving literal top-level directory roots with bounded summaries; this plan should remain separate and only be referenced for coordination.
- `packages/safe-rm/package.json` — verification scripts: `npm test`, `npm run typecheck`, and `npm run pack:check`.

## Implementation Constraints
- Runtime is Node.js 20+ with TypeScript `NodeNext`; keep the single extension entry point publishable through `packages/safe-rm/package.json`.
- Model-visible text from hook blocks, `validate_rm`, tool prompt guidelines, README, and spec must not instruct the agent to delete smaller chunks, batches, child subtrees, or one dependency-tree segment at a time.
- Do not weaken existing hard-cap behavior in this plan: exact snapshots still fail closed above `ENTRY_LIMIT` and do not create executable approvals.
- Do not implement the literal-directory bounded-summary behavior here; that remains in `docs/plans/20260724-remove-literal-directory-entry-cap.md`.
- Preserve current protected-root, dynamic-target, glob, exact-command retry, session, TTL, and rewrite contracts.

## Assumptions
- “Manual batching” includes instructions like “delete smaller chunks,” “delete smaller subtrees,” “batch the directory,” “narrow the glob/path” when used as a workaround for an over-cap tree, and similar agent-directed child deletion recipes.
- For this plan, the selected current behavior for over-cap exact snapshots is a clear refusal: no files were deleted, no approval was created, and the agent should stop rather than construct alternate child deletion commands.
- The separate literal-directory plan may later allow a top-level literal directory with a truncated summary; that path must still avoid any recommendation to manually batch descendants.

## Non-goals
- Do not add human approval UI or a new confirmation protocol.
- Do not add automatic internal traversal batching or literal-directory bounded summaries in this plan.
- Do not add generated child `rm -rf` commands or helper scripts that split a deletion tree.
- Do not change which commands are detected as recursive-force `rm`.
- Do not protect against other deletion mechanisms such as `find -delete`, language APIs, or shell scripts outside the command text.

## Task Summary
1. Replace hard-cap remediation text with a clear refusal.
2. Add regression tests for no-manual-batching guidance.
3. Update docs and specs to lock in the UX policy.

## Implementation Tasks

### Task 1: Replace hard-cap remediation with refusal text

Goal: Make over-cap validation terminal for the current command mode instead of suggesting child deletion commands.

Context:
- `tooManyEntriesMessage()` currently returns the reported failure text: “Delete smaller chunks in batches, narrow the glob/path.”
- `tooManyEntriesError()` already sets `canAuthorize: false`; preserve that structured contract and make the visible text match it.

Files:
- Modify: `packages/safe-rm/extensions/safe-rm.ts` — update `tooManyEntriesMessage()` and add a `validate_rm` prompt guideline forbidding manual batching after refusal.
- Test: `packages/safe-rm/test/safe-rm.test.ts` — update the entry-cap message expectations.

Steps:
- [ ] Rewrite `tooManyEntriesMessage(discoveredEntries)` to mention `ENTRY_LIMIT`, the observed over-cap count, and that no executable approval can be created for that exact deletion set.
- [ ] Add explicit model-facing wording such as “Do not work around this by issuing child deletion commands for the same directory tree.”
- [ ] Remove instructions equivalent to “delete smaller chunks,” “batch,” “subtrees,” or “narrow the glob/path” from hard-cap/refusal text.
- [ ] Add a `validate_rm` `promptGuidelines` entry that tells the model never to manually batch a directory-tree deletion after safe-rm refuses validation.
- [ ] Keep `tooManyEntriesError()` details (`state: "too_many_entries"`, `hardCap: true`, `canAuthorize: false`) unchanged unless field names already differ in source.

Verification:
- `cd packages/safe-rm && npm test -- --test-name-pattern="entry cap"`
- `cd packages/safe-rm && npm run typecheck`

Completion criteria:
- The hard-cap message is a clear refusal with no child-batching workaround.
- Structured `too_many_entries` details still report the limit and non-authorization state.
- TypeScript compiles without changing unrelated validation behavior.

### Task 2: Add no-manual-batching regression coverage

Goal: Ensure future edits cannot reintroduce the destructive batching guidance in model-visible safe-rm output.

Context:
- The current tests assert the old batching language, so they need to be inverted into negative assertions.
- The package has a lightweight mock Pi extension harness in `packages/safe-rm/test/safe-rm.test.ts` that can inspect registered tool definitions.

Files:
- Modify: `packages/safe-rm/test/safe-rm.test.ts` — add wording guards for `tooManyEntriesMessage()` and registered `validate_rm` guidelines.

Steps:
- [ ] Update the entry-cap test to assert the message contains stable facts: hard cap, discovered count, no approval/authorization, and no files deleted or no executable approval.
- [ ] Add negative assertions that hard-cap text does not match prohibited workaround language, for example `/delete smaller|smaller chunks|chunks in batches|subtrees in batches|narrow the glob|narrow the path/i`.
- [ ] Add a registration test that calls `safeRm()` with a mock `registerTool` and verifies the `validate_rm` prompt guidelines include a no-manual-batching instruction.
- [ ] If any existing hook/tool validation test snapshots include old wording, update them to assert contract facts rather than exact prose.

Verification:
- `cd packages/safe-rm && npm test -- --test-name-pattern="entry cap|validate_rm|Pi hook"`

Completion criteria:
- Tests fail if the exact failure phrase or equivalent child-batching workaround language returns.
- Tests still allow the separate literal-directory plan to introduce bounded top-level summaries later.
- Existing parser, snapshot, rewrite, and hook behavior tests remain green.

### Task 3: Document the no-manual-batching policy

Goal: Make the README and source spec tell future agents and maintainers that manual batching is forbidden after safe-rm refusal.

Context:
- The original spec’s UX notes and enumeration sections describe hard-cap behavior but do not explicitly prohibit suggesting child deletion commands.
- The separate literal-directory plan is the chosen direction for top-level directory approval; this plan should reference it without merging implementation tasks.

Files:
- Modify: `packages/safe-rm/README.md` — document the over-cap refusal behavior and no manual child-batching workaround.
- Modify: `docs/pi-safe-rm-spec.md` — update UX notes, requirements, and test-plan language to prohibit manual batching suggestions.

Steps:
- [ ] Update README behavior/limitations text to say exact over-cap validation creates no approval and agents must not split the same directory tree into child deletion commands.
- [ ] Update `docs/pi-safe-rm-spec.md` UX notes so hard-cap or unsupported deletion refusals either use an approved top-level literal-root path from the separate plan or return a clear refusal; they must not recommend hand-built child deletion commands.
- [ ] Add spec test-plan bullets requiring negative wording coverage for manual batching phrases.
- [ ] Keep the existing literal-directory bounded-summary plan in `docs/plans/20260724-remove-literal-directory-entry-cap.md` unchanged except for future work explicitly requested separately.

Verification:
- `rg -n "Delete smaller|smaller chunks|chunks in batches|subtrees in batches|narrow the glob|narrow the path" packages/safe-rm docs/pi-safe-rm-spec.md` returns no matches.
- `cd packages/safe-rm && npm test`
- `cd packages/safe-rm && npm run typecheck`
- `cd packages/safe-rm && npm run pack:check`

Completion criteria:
- README/spec describe refusal without suggesting child-batch deletion commands.
- Documentation points maintainers to top-level literal-root bounded summaries as separate planned work, not manual batching.
- Full package verification passes.

## Cross-Task Verification
- `cd packages/safe-rm && npm test`
- `cd packages/safe-rm && npm run typecheck`
- `cd packages/safe-rm && npm run pack:check`
- `rg -n "Delete smaller|smaller chunks|chunks in batches|subtrees in batches|narrow the glob|narrow the path" packages/safe-rm docs/pi-safe-rm-spec.md` should return no matches.

## Risks and Mitigations
- Risk: Refusal text could still nudge an agent toward destructive alternate commands.
  Mitigation: Add negative wording tests and an explicit tool prompt guideline against manual batching.
- Risk: The wording guard could be too broad and reject benign mentions of “batching” in explanatory docs.
  Mitigation: Test specific prohibited instructions and use targeted `rg` checks for known dangerous phrases.
- Risk: This UX-only plan does not solve large literal directory approval by itself.
  Mitigation: Keep it separate and reference `docs/plans/20260724-remove-literal-directory-entry-cap.md` for the top-level literal-root bounded-summary implementation.

## Open Questions
- None.
