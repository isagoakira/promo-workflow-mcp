# Node 6: persistent production record

The main workflow still has seven nodes. `videoProduction` is stored independently in the workflow record to describe production activity without turning every rework combination into a top-level state.

Six stages: material check, story rough cut, sound cleanup, picture fine cut, subtitle proofreading, and final delivery. Each stage permits any number of subtasks and revision rounds.

## Daily use

1. Passing preproduction human review creates the production record automatically. Existing node 6 projects can initialize it with `promo_video_production_update(action=start)`. Old delivery results do not automatically count as six-stage acceptance.
2. The agent first reads `promo_video_production`, adds/updates tasks (`task`) according to current guidance, and records owner and pending/in-progress/blocked/completed status. Completed tasks must reference real artifacts from this workflow.
3. When all current tasks are complete, `submit` binds deliverables and the current registered video. Unresolved video feedback blocks submission.
4. At node 6, the user reviews deliverables and acceptance checklists and opens video annotations. Only after entering confirmation evidence, clicking “Confirm this version and continue,” and confirming again does the workflow advance. Agent tools expose no human confirmation entry point.
5. For problems, select the earliest affected stage and rework it. Confirmation for that stage and later stages becomes invalid and tasks return to pending; earlier confirmations remain. History preserves old-round tasks, submitted versions, and confirmations.
6. For planning changes, enter a reason and return to nodes 2–5. The main workflow enters that node and pauses production without deleting its record. After upstream decisions and human review, the user chooses the earliest affected stage when resuming node 6.

## Constraints

- `expectedRevision`, retry keys, and submission IDs prevent concurrent overwrites and confirmation of old rounds.
- Every non-material stage requires the current registered video; confirmation rechecks video and plan versions.
- Six-stage confirmation does not replace final backend file checks. `lock_production` also requires all stages complete, matching current plan/video, no unresolved annotations, and existing backend verification.
- CutWorkBench retains one execution node. The bridge synchronizes only the current stage, round, subtasks, and guidance; it creates no second stage state machine and does not treat guidance as video verification evidence.
- People explicitly choose affected stages after content changes. This is a recorded impact judgment, not a claim that the system understands every video dependency automatically.
- Historical projects/media are not copied; production records store references only. Real workflows and old approvals are not automatically migrated.

## Tests

`video-production.test.mjs` covers multiple tasks, blocking, rework, stale previews, human confirmation, planning returns, resumption, and concurrent retries. The original full-video workflow test now requires all six stages before locking. `serve-production-demo.mjs` creates an independent interactive example without video copies.

2026-09-08 validation: 75 Promo tests and 105 CutWorkBench tests passed. Real MCP integration verified production-guidance synchronization and the original video-review revision path. An independent workbench demo exercised “confirm materials → rough-cut rework → return to material plan → resume after upstream confirmation,” entering round 3 and retaining the earlier material-stage confirmation. Upstream confirmation was simulated in test data; real projects were untouched.
