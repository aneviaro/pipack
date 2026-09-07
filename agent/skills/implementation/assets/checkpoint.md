# Coordinator checkpoint

Keep one current checkpoint in the coordinator conversation. Replace every
placeholder; do not save it, transcripts, raw reports, or runtime state in the
repository. It contains only durable IDs, concise outcomes, retained refs, the
stopped gate, and exactly one next action.

```yaml
plan: <plan path>
task: <Task N or Iteration N>
attempt: <number>
correction: <number, or 0>
no_change_cycles: <consecutive unchanged correction candidates>
active_branch: <branch>
task_base_sha: <Base SHA>
worker_reasoning: <medium|high|xhigh>
baseline_status_identity: <concise status/index/content identity>
worker: <agent ID/handle>
worker_outcome: <one concise result or error>
revmux_task: <temporary task id, or none>
revmux_round: <temporary round name, or none>
revmux_tasks_dir: <temporary absolute path outside repository, or none>
outcome: <running|success|provider-error|turn-limit|aborted|blocked|unknown>
scope_reconciliation: <none, pending, rejected, or final added paths with concise rationale>
retained_transport_refs:
  - <pi-agent-* ref @ recorded SHA, or none>
review: <pending|approve|request changes|blocked|not applicable>
review_summary: <concise sources/findings/questions result>
review_responses: <concise worker rebuttals, or none>
stopped_gate: <gate name, or none>
NEXT_SAFE_ACTION: <exactly one safe next action>
```

Refresh it before and after each worker, revmux round, integration, and commit
transition. On resume, reread the plan and checkpoint, inspect status, and
revalidate branch, Base SHA, index, baseline, transport refs, and any retained
revmux archive before taking the single named `NEXT_SAFE_ACTION`.
