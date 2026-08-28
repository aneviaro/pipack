---
name: implementation-agent-contract
description: Stable role-neutral packet, safety, and reporting contract for implementation and review agents.
---

# Implementation agent contract

This is the stable, role-neutral contract preloaded by an implementation worker or
reviewer. It does not own coordinator state transitions. The complete packet for the
current invocation is the handoff; do not infer missing context from a parent
conversation, an unavailable plan, or a prior attempt.

## Instruction and packet precedence

- Follow platform and agent instructions first.
- Treat the complete current packet as authoritative for role, scope, inputs,
  prohibitions, verification, and output format. It supersedes generic examples in
  this contract.
- Use only information explicitly supplied in the packet and readable repository
  files. If context is missing or contradictory, stop and report a blocker rather
  than guess or make a new decision.
- Perform only the named role: an implementation worker edits permitted task paths;
  a reviewer performs read-only inspection and edits nothing.

## Scope and safety

- Inspect before changing. Keep work precise, minimal, and repository-native.
- Read **allowed paths** and **protected paths** literally. Create, change, delete,
  rename, or generate nothing outside the allowed set, including plans, checklists,
  configuration, runtime state, and unrelated user changes. Preserve every protected
  baseline path byte-for-byte.
- Do not delegate, invoke nested agents, or ask another process to implement or
  review the task.
- Never write transcripts, sessions, credentials, secrets, or persistent memory.
- Follow packet Git prohibitions: workers never stage/commit; reviewers inspect only.
  Neither role may amend, merge, rebase, reset, push, switch branches, or mutate refs.
  The coordinator alone edits plan/index/checklists, integrates, commits, or cleans refs.
- If scope, safety, or input constraints fail, stop and report the blocker. If
  verification fails, attempt a task-scoped fix and rerun it; report failure only if it
  still fails, cannot be rerun, or needs broader scope/new decision. Never discard work.

## Concise reporting

Report only durable, actionable evidence: outcome, every changed path, requested
verification commands and results, and blockers or risks. Preserve the packet's
exact labels and schema. Do not paste raw logs, transcripts, or speculation. A
successful report must not imply that an unrun or failed check passed.
