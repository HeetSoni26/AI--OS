# Part 3 Client, Project, and Deletion State Contracts

## Client service status

The client service status is independent of record lifecycle:

```text
prospect → onboarding → active ↔ paused
    │          │          │       │
    └──────────┴──────────┴──────→ churned
```

All transitions are owner-controlled in Part 3. Status changes are durable mutations with safe audit and outbox records. `churned` does not physically delete a client.

## Record lifecycle

```text
live ──archive──> archived ──recover──> live
  │                  │
  └────schedule deletion──────────────┐
                                     ▼
                        deletion scheduled
                        (archived + hidden from active lists)
                          │                    │
             cancel before recoveryUntil      │ after seven full days,
                          │                    │ worker eligibility checks pass
                          ▼                    ▼
                 prior lifecycle         permanently deleted
```

Scheduling requires all of the following in one request and transaction:

1. The exact typed phrase `DELETE <client UUID>`.
2. Explicit acknowledgement of the calculated impact manifest.
3. No legal hold or registered deletion blocker.
4. No existing pending/executing deletion plan.

`executeAfter` and `recoveryUntil` are exactly seven days after `requestedAt`. Cancellation is allowed only while the request is pending and the current time is strictly earlier than both timestamps. The deletion worker rechecks status, confirmation, legal hold, registry version, recovery deadline, and its optimistic claim before each participant and before completion.

The versioned impact registry is extensible: later parts add participants for data introduced by their modules. Part 3 includes PostgreSQL records, graph projection state, file metadata/private objects, disposable cache references, and known provider references.

## Project status and delivery gate

```text
planning → in_progress → review → delivered → complete
              ▲           │          │
              └──revision─┘          └──revision
```

The application records every status transition in `project_status_history` with actor, reason, correlation ID, and timestamp. A requested transition to `delivered` is rejected when any live required deliverable has no `completedAt`. The database trigger enforces the same invariant against direct writers and prevents later removal or incompletion of a required deliverable while its project remains delivered.

Rejected delivery attempts create a safe audit record with blocker IDs/titles but do not change the project status. No override bypass exists in Part 3.

## Time attribution

- Manual time belongs to the active owner, may reference an owner assignment/task in the same project, and cannot overlap another live manual interval for that owner.
- Agent time is recorded only from a successful completed durable `AgentRun` belonging to the same client.
- Agent duration is derived from `durationMs` or run timestamps, never caller estimates.
- If an assignment is supplied for agent time, its agent must match the run and its task/project references must agree.
- One `AgentRun` can produce at most one time entry.
- Project `hoursSpent` is derived from live time entries by a database trigger; it is not an independently editable total.
