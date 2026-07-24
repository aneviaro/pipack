---
Created: 2026-07-13
Status: Draft
Owner: TBD
---

# Pi Safe RM

## Summary

Add a publishable Pi package, `@aneviaro/pi-safe-rm`, that intercepts model-issued `bash` tool calls containing recursive-and-force `rm` invocations. The first call is blocked. Pi instructs the model to call a dedicated `validate_rm` tool, which safely resolves and enumerates the deletion set, returns a summary and representative sample, and records a short-lived one-time approval. The exact command may run only after the model retries it, the target set still matches the validated snapshot, and no protected root is targeted.

## Problem

A model can issue `rm -rf` with an incorrect, overly broad, or unexpectedly expanded target. Shell confirmation is normally absent in tool execution, so one mistaken operand can irreversibly remove a large tree before the model inspects what it selected.

A text-only warning is insufficient: the extension needs a deterministic protocol that blocks the initial deletion, requires filesystem inspection, binds validation to the command and working directory, and fails closed when the target set cannot be established safely.

## Goals

- Block the first model-issued `bash` tool call for every recognized `rm` invocation that combines recursive and force behavior.
- Require the model to inspect a validator-produced deletion summary and sample before retrying.
- Bind validation to one exact command, one working directory, one filesystem snapshot, and one retry.
- Recheck the deletion set immediately before allowing execution and invalidate approval when paths or file types changed.
- Permanently deny deletion of critical roots.
- Handle static path operands and standard shell globs without executing command substitutions or other dynamic expressions.
- Ship as a tested, documented, publishable Pi package consistent with the repository’s existing packages.

## Non-goals

- Human confirmation or approval.
- Intercepting direct user `!`/`!!` shell commands.
- Guarding `rm` unless both recursive and force options are active.
- Guarding unrelated deletion mechanisms such as plain non-recursive `rm`, `find -delete`, `unlink`, language APIs, or trash utilities.
- Inspecting external scripts or binaries to discover recursive `rm` commands hidden inside them.
- Reading or validating file contents.
- Persisting approvals across reloads, process restarts, or sessions.
- Guaranteeing an atomic filesystem snapshot; a small residual race remains between the final check and process execution.

## Users and Use Cases

- A Pi user allows the model to clean build output, dependency directories, generated files, or temporary trees while reducing accidental deletion risk.
- A model proposes `rm -rf build`; the extension blocks it, summarizes the tree through `validate_rm`, and allows one unchanged retry.
- A model proposes a wildcard deletion such as `rm -rf build/*`; the validator resolves the standard glob, shows what matched, and the hook rewrites the approved invocation to the validated concrete roots before execution.
- A model proposes a dynamic target such as `rm -rf "$TARGET"` or `rm -rf "$(command)"`; the extension refuses validation and requires concrete operands.

## Proposed Behavior

### 1. Detection

The extension subscribes to Pi’s `tool_call` event and inspects only calls whose `toolName` is `bash`.

It uses shell-aware tokenization/parsing rather than a regex-only decision. It must distinguish executable words and options from comments, quoted data, and unrelated text. A command is guarded when a recognized `rm` invocation has both:

- recursive behavior: `-r`, `-R`, `--recursive`, or a bundled short option containing `r`/`R`; and
- force behavior: `-f`, `--force`, or a bundled short option containing `f`.

Examples that must be guarded include:

```text
rm -rf path
rm -fr path
rm -r -f path
rm -Rf path
rm --recursive --force path
/bin/rm -rf path
command rm -rf path
env rm -rf path
sudo rm -rf path
```

The parser must inspect every simple command in a compound shell command. Multiple guarded invocations in one `bash` call form one validation request and must all validate before the whole call can run.

Known indirection that exposes a recursive-force `rm` but supplies runtime-generated operands, including `xargs rm -rf`, `find ... -exec rm -rf`, and `eval`, must fail closed as dynamic. Quoted nested shell programs passed to `sh -c`/`bash -c` should be recursively analyzed when they are static strings; otherwise they fail closed. An external script whose contents are not present in the tool input is out of scope.

Possible recursive-force `rm` syntax that cannot be parsed confidently is blocked with an unsupported-syntax explanation. The extension must not execute any part of the proposed command to analyze it.

### 2. Initial block

On the first matching call, the hook:

1. Parses all guarded invocations and operands.
2. Creates an opaque validation request ID bound to the exact command bytes and `ctx.cwd`.
3. Blocks the tool call before any command segment executes.
4. Returns a reason that tells the model no deletion occurred and instructs it to call:

```json
{ "requestId": "<opaque-id>" }
```

with the `validate_rm` tool.

Changing whitespace, options, operands, compound-command structure, or working directory creates a different command and requires a new validation.

### 3. Static target rules

The validator accepts:

- quoted or unquoted literal path operands;
- relative and absolute paths; and
- standard `*`, `?`, and bracket-expression globs.

Relative paths resolve against the captured working directory. Standard globs use deterministic default matching: dotfiles match only when the relevant pattern segment begins with `.`, and path separators are not matched by a single segment wildcard.

The validator rejects shell-dependent or executable expansion, including:

- environment and positional variables;
- command substitution and process substitution;
- `eval` or dynamically generated argument vectors;
- brace expansion, extglob, and shell-option-dependent globstar behavior; and
- operands obtained from pipes, stdin, `xargs`, or `find -exec`.

The error must ask the model to rewrite the deletion using concrete literal paths or supported standard globs.

### 4. Critical-root denial

Validation can never approve a resolved top-level target equal to:

- filesystem root `/`;
- the current user’s home directory;
- the captured working directory; or
- any ancestor of the captured working directory.

The rule applies after path normalization, symlink-safe lexical resolution, and glob expansion. It cannot be bypassed with `..`, repeated separators, `--no-preserve-root`, path-qualified `rm`, or equivalent option spellings. Descendants of the working directory, such as `./node_modules`, remain eligible.

If any invocation contains a denied target, the entire `bash` call remains blocked.

### 5. Enumeration and model-facing validation

`validate_rm` performs a read-only traversal of every resolved deletion root:

- Use `lstat` semantics.
- Include each existing top-level root and every descendant that `rm` would remove.
- Do not follow symbolic links; a symlink contributes one symlink entry.
- Track missing literal operands and unmatched globs separately.
- Stop and fail closed on permission errors, filesystem errors, cancellation, parser ambiguity, or more than 10,000 discovered existing entries.
- Do not read file contents.

A successful result contains:

- the original command and working directory;
- the concrete top-level roots matched by each guarded invocation;
- missing operands and unmatched patterns;
- counts for total entries, regular files, directories, symlinks, and other file types;
- aggregate apparent bytes for regular files when available;
- a deterministic sample of at most 100 paths, including every top-level root when the root count permits, then lexically first and last descendant paths;
- the number of omitted sample entries;
- warnings, including missing targets; and
- the approval expiration time.

Paths in text output must be unambiguous and escaped so control characters or newlines cannot masquerade as separate entries.

The traversal builds a canonical fingerprint from each absolute path and its file type. Missing literals and unmatched patterns are included as markers so a newly appearing target invalidates the snapshot.

Calling `validate_rm` successfully marks the request validated. The model’s subsequent decision to retry the exact command is its approval; no human prompt or separate attestation is required.

If there are no existing matched targets, validation reports a no-op and does not create an executable approval. The model should skip the deletion.

### 6. Retry and execution

A validated approval is usable for exactly one matching `bash` tool call within five minutes of successful validation.

Before allowing the retry, the hook:

1. Confirms the request belongs to the active session.
2. Confirms exact command-byte and working-directory equality.
3. Re-parses the command.
4. Re-resolves globs and re-enumerates all targets.
5. Reapplies the 10,000-entry limit and critical-root rules.
6. Compares canonical path-and-type fingerprints.

If anything differs, the hook consumes/invalidate the stale approval, blocks the call, creates a fresh validation request, and explains that the target set changed.

If the snapshot still matches, the hook consumes the approval before execution and mutates each guarded `rm` invocation to use the validated concrete existing roots, safely shell-quoted after an option terminator. Missing literal operands and unmatched glob expressions are omitted. This prevents a top-level wildcard or previously missing operand from selecting a newly created root after validation. Existing non-target options and surrounding compound-command syntax are preserved.

If command rewriting cannot be proven semantics-preserving, execution fails closed rather than running the original expression.

The approval remains consumed even if the eventual shell process fails. A later retry requires a new validation.

### 7. Lifecycle and concurrency

- Pending requests and approvals are held only in memory and isolated by Pi session.
- Requests are opaque and unguessable.
- Session switch, fork replacement, shutdown, extension reload, or process restart clears relevant state.
- Multiple pending requests may exist, but each request ID maps to one exact command and working directory.
- Pi’s sequential tool-call preflight must consume an approval atomically so parallel sibling calls cannot reuse it.
- Expired, unknown, cross-session, already-consumed, or superseded request IDs return an error and never authorize deletion.

## Requirements

### Functional

- Register the `validate_rm` custom tool with a required string `requestId` parameter.
- Register a `tool_call` handler for model-issued `bash` calls.
- Block matching commands before any shell segment executes.
- Recognize recursive and force options in separate, bundled, short, and long forms.
- Avoid triggering on comments, data strings, or `rm` invocations lacking either recursive or force behavior.
- Fail closed for dynamic targets and ambiguous parsing.
- Enumerate supported targets without following symlinks or reading contents.
- Enforce critical-root denial and the 10,000-entry cap.
- For hard-cap or unsupported-deletion refusals, create no executable approval and do not suggest splitting the same directory tree into child deletion commands or manual batches.
- Return a summary and deterministic sample to the model.
- Require an exact, one-time retry within five minutes.
- Invalidate validation when the path/type fingerprint changes.
- Rewrite globbed and missing operands to the validated concrete existing root list before execution.
- Leave non-matching `bash` calls and all non-`bash` tool calls unchanged.

### Non-functional

- Support Node.js 20+ and the current Pi extension APIs used by this repository.
- Support macOS and Linux path and `rm` conventions covered by the detection matrix.
- Use bounded memory proportional to at most 10,000 entries.
- Respect cancellation during traversal and final revalidation.
- Do not persist path inventories, approvals, or filesystem metadata outside normal Pi session tool results.
- Do not log file contents, command output, or path inventories to external services.
- Keep parsing, enumeration, fingerprinting, state management, and Pi event wiring separable for unit testing.
- Prefer false-positive blocking with a clear remediation over false-negative execution when syntax is ambiguous.

## Data and Contracts

### Package layout

```text
packages/safe-rm/
├── extensions/
│   └── safe-rm.ts
├── test/
│   └── safe-rm.test.ts
├── LICENSE
├── README.md
├── package.json
├── package-lock.json
└── tsconfig.json
```

The package manifest should use:

- npm name `@aneviaro/pi-safe-rm`;
- public publishing metadata;
- Pi extension entry `./extensions/safe-rm.ts`;
- Node.js `>=20`;
- repository-standard `test`, `typecheck`, and `pack:check` scripts; and
- Pi core imports as peer dependencies rather than bundled runtime copies.

Any shell parsing or glob library required at runtime must be listed in `dependencies`, not `devDependencies`, and must not evaluate shell expressions.

### `validate_rm` input

```typescript
interface ValidateRmParams {
  requestId: string;
}
```

### Internal request state

```typescript
interface PendingRmValidation {
  requestId: string;
  sessionKey: string;
  command: string;
  cwd: string;
  createdAt: number;
  parsedInvocations: ParsedRmInvocation[];
  snapshot?: DeletionSnapshot;
  validatedAt?: number;
  expiresAt?: number;
  consumed: boolean;
}
```

### Snapshot

```typescript
interface DeletionSnapshot {
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
}
```

The canonical fingerprint includes normalized absolute path identity and `lstat` file type, sorted deterministically. It intentionally excludes file contents, timestamps, permissions, and regular-file size; changing those does not alter which path names `rm` selects.

### Tool result states

`validate_rm` should return structured `details` and concise model-visible text for:

- `validated`;
- `unknown_request`;
- `expired`;
- `already_consumed`;
- `cross_session`;
- `dynamic_target`;
- `protected_target`;
- `unsupported_syntax`;
- `too_many_entries`;
- `filesystem_error`;
- `cancelled`; and
- `no_matching_targets`.

Only `validated` creates an approval.

## UX Notes

- The initial blocked tool result must begin with a direct statement such as: “Blocked: no files were deleted.”
- It must give the exact next action and request ID rather than relying only on the tool description.
- `validate_rm` should clearly separate roots, counts, sample paths, omitted count, warnings, and expiration.
- Dangerous targets and dynamic syntax should name the reason without suggesting a bypass.
- Hard-cap or unsupported-deletion refusals must either use an approved top-level literal-root path or clearly refuse; they must never recommend hand-built child deletion commands or manual batches. Top-level literal-root bounded summaries are separate planned work in `docs/plans/20260724-remove-literal-directory-entry-cap.md`.
- A changed snapshot should explicitly state that revalidation is required and provide the new request ID.
- The extension requires no interactive UI and works in TUI, RPC, and other model-driven modes where custom tools and tool-call interception are available.
- The package README must explain the model-only approval model, protected roots, unsupported dynamic syntax, 10,000-entry cap, five-minute TTL, and residual race limitation.

## Security and Privacy

- Treat all command text and path names as untrusted data.
- Never interpolate unescaped paths into rewritten shell source.
- Insert `--` before rewritten operands so filenames beginning with `-` cannot become options.
- Do not follow symlinks during validation.
- Do not execute shell expansion to determine targets.
- Do not let a model-provided request ID alter command, cwd, targets, TTL, or session binding.
- Consume approvals atomically and before the underlying command runs.
- Revalidate critical-root rules on both validation and retry.
- Keep all authorization state ephemeral.

This mechanism reduces accidental deletion risk but is not a security boundary against a malicious model with unrestricted shell access. The model could use another deletion mechanism that is explicitly outside this version’s scope.

## Rollout and Migration

1. Add `packages/safe-rm/` and allowlist it in the repository `.gitignore`.
2. Add the package to the root README’s tracked-package table and included-package section.
3. Install locally with `pi -e ./packages/safe-rm` for manual verification.
4. Add `../packages/safe-rm` to `agent/settings.json` only after tests and manual checks pass.
5. Run package typecheck, tests, and `npm pack --dry-run`.
6. Publish `@aneviaro/pi-safe-rm` as a new package; no migration or persisted-state conversion is required.

The extension is enabled when the package is loaded. Version 1 has no feature flag or configuration file. Removing/disabling the package restores prior behavior.

## Test Plan

- Unit-test detection for separate, bundled, reordered, short, long, uppercase `-R`, path-qualified, and wrapper forms.
- Verify `rm -r`, `rm -f`, plain `rm`, comments, echoed strings, and unrelated commands are not guarded.
- Test compound commands and multiple guarded invocations.
- Test static nested `sh -c` analysis and fail-closed handling for variables, substitutions, `eval`, `xargs`, `find -exec`, unsupported glob syntax, and parser ambiguity.
- Verify the first matching call is blocked and no command segment executes.
- Test relative/absolute paths, spaces, quotes, leading-dash filenames, dotfiles, standard globs, unmatched globs, and missing operands.
- Test file, directory, symlink, broken-symlink, and other file-type counts; verify symlink targets are never traversed.
- Test deterministic summaries, escaping of control characters, sample limits, and fingerprint stability.
- Verify traversal fails closed at entry 10,001, on permission/filesystem errors, and on cancellation.
- Verify hard-cap refusal wording reports the cap, discovered count, no approval, and no files deleted or executable approval; assert it does not suggest smaller deletions, batches, subtrees, or narrowing the glob/path.
- Verify registered `validate_rm` prompt guidelines prohibit manual child-directory batching after a refusal.
- Test permanent denial for `/`, home, cwd, and cwd ancestors through normalized and globbed spellings.
- Verify successful validation allows only one exact command/cwd retry and that approval expires after five minutes.
- Verify approvals do not cross sessions, survive consumption, or survive lifecycle resets.
- Modify the tree between validation and retry by adding, removing, renaming, and changing the type of entries; verify every case blocks and requires revalidation.
- Verify the approved retry rewrites globs to concrete quoted roots, removes missing/unmatched operands, preserves surrounding shell syntax, and fails closed when safe rewriting is impossible.
- Mock Pi’s extension API to verify tool registration, event wiring, block reasons, state transitions, and atomic consumption.
- Run `npm run typecheck`, `npm test`, and `npm run pack:check` in `packages/safe-rm/`.
- Manually verify in Pi with a temporary directory, including successful cleanup, changed-tree invalidation, protected-root denial, dynamic-target denial, cap behavior, and session reload cleanup.

## Implementation Milestones

1. **Package scaffold:** manifest, TypeScript config, extension entry point, test harness, README, license, repository allowlist.
2. **Command analysis:** shell-aware tokenizer/parser, guarded invocation detection, static/dynamic classification, protected-root normalization, and detection tests.
3. **Filesystem validation:** glob resolution, symlink-safe bounded traversal, summaries, deterministic samples, and fingerprints.
4. **Approval state machine:** request IDs, session isolation, TTL, one-time atomic consumption, lifecycle cleanup, and structured tool results.
5. **Retry enforcement:** snapshot revalidation, concrete-operand rewriting, compound-command preservation, and fail-closed behavior.
6. **Integration and rollout:** Pi API tests, manual temporary-directory checks, root README/settings updates, packaging check, and publication.

## Open Questions

- None.
