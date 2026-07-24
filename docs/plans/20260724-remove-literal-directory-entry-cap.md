# Remove Literal Directory Entry Cap Failure

## Overview
Change `@aneviaro/pi-safe-rm` so a model can validate and approve a concrete literal directory target such as `packages/codex-limit-tracking-footer/node_modules` even when that directory contains more than 10,000 descendants. Literal directory validation should prove the requested top-level path is the intended object and provide a bounded contents summary, without requiring a complete descendant snapshot. Glob operands must continue to expand to exact concrete roots and remain subject to exact snapshot/cap behavior.

## Source Spec
- Spec: `prompt: Remove the 10,000-entry failure for literal directory targets`
- Status: Approved
- Last reviewed: 2026-07-24

## Repository Context
- `packages/safe-rm/extensions/safe-rm.ts` — Pi extension implementation; contains command analysis, protected-path checks, glob expansion, deletion snapshot construction, fingerprinting, output formatting, approval retry checks, and command rewriting.
- `packages/safe-rm/test/safe-rm.test.ts` — Node test suite for parser behavior, filesystem snapshotting, protected targets, entry-cap behavior, approval state machine, and rewrite behavior.
- `packages/safe-rm/README.md` — user-facing package behavior docs; currently says validation fails closed above 10,000 discovered entries.
- `docs/pi-safe-rm-spec.md` — original package spec; currently requires full traversal and failure above 10,000 discovered existing entries.
- `packages/safe-rm/package.json` — verification scripts: `npm test`, `npm run typecheck`, and `npm run pack:check`.
- `.gitignore` — repository allowlist; new plan files under `docs/plans/` must be explicitly allowlisted to be tracked.

## Implementation Constraints
- Runtime is Node.js 20+ with TypeScript `NodeNext`; keep the single extension entry point publishable through `packages/safe-rm/package.json`.
- Keep `lstat` semantics and never follow symlinks while validating or summarizing deletion targets.
- Preserve critical-root denial for `/`, the user home directory, `ctx.cwd`, and ancestors of `ctx.cwd` before any approval can be created.
- Keep exact concrete-root expansion for supported globs; do not execute shell expansion, variables, command substitution, brace expansion, extglob, `xargs`, or `find -exec`.
- The approval retry remains one-use, exact-command, exact-cwd, same-session, and five-minute TTL-bound.
- The literal-directory path no longer guarantees descendant-set stability between validation and retry; it guarantees top-level path identity and bounded visibility only.

## Assumptions
- “Literal directory target” means an operand that did not contain supported glob syntax and whose `fs.lstat` result is a directory. A symlink operand is validated as a symlink root and is not traversed.
- It is acceptable for files inside a validated literal directory to be added, removed, or renamed between validation and retry as long as the top-level path still resolves to the same `lstat` device/inode/type and still passes protected-path rules.
- Existing exact snapshot behavior remains appropriate for literal files, literal symlinks, glob-matched files, and glob-matched directories.

## Non-goals
- Do not add human approval UI or a new confirmation protocol.
- Do not make `rm -rf some-glob` bypass the 10,000-entry exact snapshot cap.
- Do not follow symlinks or inspect file contents.
- Do not protect against other deletion mechanisms such as `find -delete`, language APIs, or shell scripts outside the command text.

## Task Summary
1. Refactor snapshot data to preserve target provenance and top-level identity.
2. Implement bounded literal-directory summaries and retry validation.
3. Update tests and documentation for the new literal-directory contract.

## Implementation Tasks

### Task 1: Refactor snapshot roots to preserve provenance and identity

Goal: Make validation know whether each concrete root came from a literal operand or a glob match, and record top-level filesystem identity for each existing root.

Context:
- `resolveInvocationRoots()` currently returns only root strings, so `buildDeletionSnapshot()` cannot distinguish a literal `node_modules` directory from a glob-matched directory.
- The new behavior depends on preserving operand provenance and comparing the top-level `lstat` identity (`dev`, `ino`, and type) on validation and retry.

Files:
- Modify: `packages/safe-rm/extensions/safe-rm.ts` — add root metadata types and update root resolution/snapshot construction.
- Test: `packages/safe-rm/test/safe-rm.test.ts` — add focused assertions for literal-vs-glob root provenance and root identity.

Steps:
- [ ] Introduce a root metadata shape, for example `ResolvedRoot`, containing `absolutePath`, `source: "literal" | "glob"`, `fileType`, `dev`, `ino`, and the originating invocation/operand information needed for `rewriteCommand()`.
- [ ] Update `SnapshotInvocation` to retain root metadata while preserving the existing `roots: string[]`-style data needed by formatter/rewrite code.
- [ ] Move `lstatMaybe()` calls into root resolution for existing literal and glob matches so protected-path checks, type detection, and identity capture happen once per concrete top-level root.
- [ ] Ensure missing literal operands and unmatched glob patterns still contribute marker data to the snapshot fingerprint so newly appearing targets invalidate approvals.
- [ ] Update fingerprint generation to include top-level identity for every existing root; for exact snapshots, keep existing descendant path/type fingerprinting as well.

Verification:
- `cd packages/safe-rm && npm test -- --test-name-pattern="enumerates deletion sets|fingerprint changes|rewrites approved commands"`
- `cd packages/safe-rm && npm run typecheck`

Completion criteria:
- Snapshot construction can tell literal directory roots from glob-matched directory roots.
- Snapshot details expose top-level type/device/inode identity for existing roots.
- Existing exact snapshot, missing operand, unmatched glob, and rewrite tests continue to pass after the refactor.

### Task 2: Implement bounded summaries for literal directory targets

Goal: Allow `validate_rm` to approve a literal directory target with more than 10,000 descendants by summarizing bounded contents and fingerprinting only the top-level path identity.

Context:
- `collectEntries()` currently recursively traverses every directory root and throws `too_many_entries` after `ENTRY_LIMIT`.
- The requested contract says literal directory validation should check the resolved top-level path, directory/symlink status, inode/device identity, protected-path rules, and a bounded contents summary, not a full descendant snapshot.
- Glob-selected directories must still use exact expansion/snapshot rules because the model needs the concrete glob-selected roots and stable deletion set.

Files:
- Modify: `packages/safe-rm/extensions/safe-rm.ts` — add bounded literal-directory summary path, update formatter and retry comparison.
- Test: `packages/safe-rm/test/safe-rm.test.ts` — add regression tests for large literal directory approval and large glob-matched directory rejection.

Steps:
- [ ] Add a bounded summary helper for literal directories, e.g. `summarizeLiteralDirectory(root, signal)`, that uses `lstat`/directory reads without following symlinks, stops after a fixed summary budget, records whether the summary was truncated, and returns sample paths plus lower-bound counts rather than exact descendant totals.
- [ ] In `buildDeletionSnapshot()`, route existing literal directory roots through the bounded summary helper instead of `collectEntries()`; route literal files/symlinks and every glob-derived root through exact entry collection.
- [ ] Keep `ENTRY_LIMIT` as the hard cap for exact snapshots; do not throw `too_many_entries` for the bounded literal-directory summary path.
- [ ] Change snapshot fingerprinting so literal directory roots include path, file type, `dev`, and `ino`, but not every descendant path. Exact roots should still include descendant path/type entries.
- [ ] Update `formatSnapshotText()` to clearly label bounded literal-directory summaries, top-level identity, truncated summaries, and any lower-bound counts so the model does not mistake them for a complete descendant inventory.
- [ ] Update retry validation in the `tool_call` approval path to accept literal directory content churn when the same command/cwd still resolves to the same top-level root identity and protected-path checks still pass.
- [ ] Ensure `rewriteCommand()` still rewrites to concrete top-level roots after `--`; for a literal directory, that root is the literal directory itself, not its descendants.

Verification:
- `cd packages/safe-rm && npm test -- --test-name-pattern="literal directory|entry cap|Pi hook blocks"`
- Manual check in a temp fixture: validate `rm -rf literal-large-dir` where the directory has `ENTRY_LIMIT + 1` children and confirm `validate_rm` returns `state: "validated"` rather than `too_many_entries`.

Completion criteria:
- A literal directory with more than 10,000 descendants validates successfully with bounded summary text.
- A glob that selects a directory with more than 10,000 descendants still returns `too_many_entries`.
- Replacing the literal directory itself between validation and retry blocks execution, while changing only descendants does not invalidate solely because the descendant set changed.

### Task 3: Update tests and documentation for the new contract

Goal: Make the test suite and docs describe the new literal-directory exception while preserving the exact glob and protected-path guarantees.

Context:
- `packages/safe-rm/test/safe-rm.test.ts` currently has an entry-cap message assertion that is already failing against the current implementation text; update it while adding the new behavior tests.
- `packages/safe-rm/README.md` and `docs/pi-safe-rm-spec.md` both say validation fails closed above 10,000 discovered entries without distinguishing literal directories from exact/glob snapshots.

Files:
- Modify: `packages/safe-rm/test/safe-rm.test.ts` — update old cap-message expectations and add new regression coverage.
- Modify: `packages/safe-rm/README.md` — document bounded literal-directory summaries and retained glob cap behavior.
- Modify: `docs/pi-safe-rm-spec.md` — revise enumeration, retry, non-functional, and test-plan sections to match the new contract.

Steps:
- [ ] Replace brittle exact wording expectations for `tooManyEntriesMessage()` with assertions for stable contract facts: 10,000 hard cap, exact/glob snapshots cannot authorize, and literal directory targets use bounded summaries.
- [ ] Add tests covering: literal large directory validates; glob-matched large directory fails; literal directory replacement changes top-level identity and blocks retry; symlink literal roots are treated as symlinks and not traversed.
- [ ] Update README behavior bullets to say the 10,000 hard cap applies to exact descendant snapshots, while literal directory operands receive bounded summaries and top-level identity validation.
- [ ] Update `docs/pi-safe-rm-spec.md` contract sections so future work does not reintroduce full descendant enumeration for literal directories.
- [ ] Run the complete package gates and fix any TypeScript/test/package issues.

Verification:
- `cd packages/safe-rm && npm test`
- `cd packages/safe-rm && npm run typecheck`
- `cd packages/safe-rm && npm run pack:check`

Completion criteria:
- Tests cover both the new literal-directory success case and preserved glob failure case.
- README/spec no longer promise full descendant snapshots for literal directories.
- Full package verification passes.

## Cross-Task Verification
- `cd packages/safe-rm && npm test`
- `cd packages/safe-rm && npm run typecheck`
- `cd packages/safe-rm && npm run pack:check`
- Manual Pi check: run a blocked `rm -rf <temp-large-literal-dir>`, call `validate_rm`, inspect that the summary identifies the top-level directory and bounded contents, then retry the exact command once and confirm it is rewritten to the concrete top-level directory.

## Risks and Mitigations
- Risk: The new literal-directory mode weakens descendant-set stability between validation and retry.
  Mitigation: Label the output as bounded, document the contract change, and fingerprint top-level device/inode/type so path replacement is still detected.
- Risk: Root metadata refactoring could break command rewriting for globs or missing operands.
  Mitigation: Keep existing rewrite tests, add literal/glob provenance tests, and preserve per-invocation concrete root arrays.
- Risk: Large-directory regression tests may be slow if they create more than 10,000 files.
  Mitigation: Prefer direct empty child files in a temp directory, scope the test narrowly, and keep any bounded-summary traversal budget independent from the hard cap.

## Open Questions
- None.
