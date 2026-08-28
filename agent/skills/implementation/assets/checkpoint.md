# Coordinator checkpoint

Keep one current checkpoint in the coordinator conversation. Replace every
placeholder; do not save this template, transcripts, raw evidence, or runtime state
in the repository. It contains only durable IDs, concise outcomes, retained refs, the
stopped gate, and exactly one next action.

```yaml
plan: <plan path>
task: <Task N or Iteration N>
attempt: <number>
correction: <number, or 0>
active_branch: <branch>
task_base_sha: <Base SHA>
baseline_status_identity: <concise status/index/content identity>
worker: <agent ID/handle>
outcome: <running|success|provider-error|turn-limit|aborted|unknown>
worker_outcome: <one concise result or error>
retained_transport_refs:
  - <pi-agent-* ref @ recorded SHA, or none>
review: <pending|approve|request changes|unavailable|not applicable>
stopped_gate: <gate name, or none>
NEXT_SAFE_ACTION: <exactly one safe next action>
```

Use opaque worker handles, commit SHAs, branch names, and other durable identifiers;
do not put transcripts or raw logs in the checkpoint. Refresh it before and after
each worker, reviewer, integration, and commit transition. On resume, reread the
plan and this checkpoint, inspect status, and revalidate branch, Base SHA, index,
baseline, and retained refs before taking the single named `NEXT_SAFE_ACTION`.
