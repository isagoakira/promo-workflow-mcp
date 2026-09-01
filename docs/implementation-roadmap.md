# Implementation Roadmap

## Execution principle

Promo Service remains the versioned workflow authority. It does not become a writer, browser, crawler, image model, renderer, or video editor.

For every non-deterministic step, it follows the Node 1 pattern:

```text
promo_run -> compact structured brief -> Agent work -> promo_commit -> local validation and version lock
```

The service owns state, revision checks, confirmation limits, artifact references, and deterministic transforms. The current Agent host owns Web Fetch, reasoning, writing, the selected Skills, and optional native media generation.

## Foundation before Node 2–4

### F1. Immutable local artifact store — implemented

Add a small filesystem `ArtifactStore` under `data/artifacts/` before storing any outline, manuscript, storyboard, SRT, preview, or release package.

- Each artifact receives an ID, content hash, MIME/type, revision, parent references, and creation time.
- Workflow JSON keeps only artifact IDs and compact state capsules.
- A new confirmed revision creates a new artifact; it never mutates a prior artifact.
- `promo_get` returns concise capsules and references, not an entire manuscript or storyboard by default.

Acceptance: restart preserves artifacts and workflow references; an old artifact is still readable after a later branch is created.

### F2. Shared Agent-work capsule — implemented

Use one small shape for every soft execution request:

```text
taskId, stage, inputs, constraints, requestedOutput, validationRules, nextCommitKind
```

This replaces node-specific megaskills. Thin Skills may consume the capsule, but cannot change workflow state themselves.

Acceptance: a host without Codex-specific APIs can complete a capsule using only the three MCP tools plus its own capabilities. Node 1 `fetchBrief` is the first live implementation of this shape.

## Milestone 2 — Node 2: baseline alignment — implemented

Implement `TOPIC_LOCKED -> ALIGNING_BASELINE -> BASELINE_LOCKED`.

1. `promo_run` builds a baseline capsule from the locked topic, selected material cards, product profile, active campaign lines, and inferred audience intent.
2. The Agent proposes `coreMessage`, `guidanceIntent`, one highest-impact unresolved question, and a recommended answer.
3. `promo_commit(kind=propose_baseline)` records or replaces the compact proposal without advancing state.
4. `promo_commit(kind=answer_baseline_grill)` records an answer and returns at most one next question.
5. `promo_commit(kind=lock_baseline)` requires both confirmed fields and creates an immutable baseline artifact.

Guardrails: exactly one pending question; no transcript persistence; reject a lock missing either durable field.

Acceptance: a selected topic can yield a capsule, one or more bounded refinements, and a locked baseline reference with a clean restart/replay path.

## Milestone 3 — Node 3: creative spine and carrier outline — implemented

Implement `BASELINE_LOCKED -> GENERATING_CREATIVE -> ALIGNING_OUTLINE -> OUTLINE_LOCKED` with visible transient completion collapsed into one `promo_run` result.

1. Add content-budget validation using the existing 2/5/10-minute video and short/standard/long article contracts.
2. `promo_run` emits an outline-generation capsule: locked baseline, evidence limits, carrier, tier, and one recommended story-engine direction.
3. The Agent returns one creative spine and one carrier outline through `promo_commit(kind=submit_outline_draft)`.
4. The service validates beats, primary CTA count, required purpose fields, video total duration, or article section-purpose uniqueness.
5. Store grill count in the state capsule; accept only one question at a time and enforce the existing maximum of 3/5/6 questions for short/standard/long work.
6. `lock_outline` writes an immutable creative-outline artifact after validation passes.

Acceptance: both carriers lock a valid outline; a video cannot lock unless segment duration equals 120, 300, or 600 seconds; the Agent cannot exceed the Grill cap.

## Milestone 4 — Node 4: complete master and reusable asset plan — implemented

Implement `OUTLINE_LOCKED -> GENERATING_MASTER -> ALIGNING_MASTER -> MASTER_LOCKED`.

1. `promo_run` creates a master-generation capsule. It explicitly routes macro writing supervision to `geek-product-promo-writing` and video craft supervision to `storyboard-direction`; neither becomes embedded service logic.
2. The Agent submits either a complete article manuscript or a continuous time-aligned storyboard via `submit_master_draft`.
3. The service performs structural checks: baseline/outline references, evidence references, CTA count, article completeness, or video continuity and final duration.
4. Require one shared asset plan: `source asset -> fragment -> usage`. Validate every usage has a source, and every ordinary source has two usages or a one-off justification.
5. Permit only blocking questions, with hard caps of 2/3/4 for short/standard/long. `lock_master` creates immutable master and asset-plan artifacts.

Acceptance: a video storyboard is gap-free and timed; an article is complete; every factual core claim has lineage or the lock is rejected.

## Milestone 5 — Node 5: deterministic requirement compiler — implemented

Implement `MASTER_LOCKED -> COMPILING_REQUIREMENTS -> REQUIREMENTS_READY` as a local transform, without an Agent round trip.

1. Read the locked master and asset-plan artifacts.
2. Merge compatible usages into the smallest tool-neutral requirement set while preserving purpose, constraints, and coverage links.
3. For video, derive structured subtitle cues and serialized SRT from the planned spoken timeline.
4. Write immutable requirement-set and SRT artifacts; expose their IDs and compact counts through `promo_get`.

Acceptance: every usage is covered exactly once or by an explicitly shared requirement; reuse count is auditable; SRT cue ranges are ordered and within the video duration.

## Milestone 6 — Node 6: production control plane — implemented; concrete backends remain narrow adapters

Implement the shared `REQUIREMENTS_READY -> PRODUCING -> PRODUCTION_LOCKED` control plane first, then add two narrow backends.

### Shared control plane

- Convert unsatisfied requirements into `production_unit` records with one route: `human`, `generative`, or `local`.
- Keep at most one human action in `promo_get`.
- Automatically accept deterministic, evidence-safe results. Require review for product appearance, people, brand expression, factual evidence, uncertain AI authenticity, or paid/new human work.
- Record `capability_gap` as a return to Node 5; do not silently weaken the master.

### Article Assembler first

- Bind one local, versioned platform profile to one branch.
- Build the ordered content-block document, asset manifest, and local HTML preview analogue with Node built-ins only.
- Lock only `documentArtifactId`, `previewArtifactId`, and `assetManifestArtifactId` after one complete preview review.

### Cut Workbench adapter second

- Define an adapter interface and a local discovery/configuration seam; Promo stores only project/revision/output references.
- Do not copy Cut Workbench's internal job model or require its dependencies at Promo installation time.
- Start the video backend only when a compatible local Cut Workbench installation is explicitly configured.

Acceptance: article production reaches a reviewable local preview with no platform API; video production can be unavailable without breaking other workflows; required human-review triggers cannot be bypassed.

## Milestone 7 — release packaging — implemented

Implement `PRODUCTION_LOCKED -> PACKAGING -> RELEASE_READY`.

1. `promo_run` emits one package brief from the locked production evidence and platform context.
2. The Agent proposes three evidence-safe titles, two cover briefs/references, and one video introduction or article summary.
3. `promo_commit(kind=submit_release_package)` validates lineage and returns one concentrated selection action.
4. `select_release_package` locks the chosen title, cover, and release text. Article branches additionally build one final local preview analogue.

No FFmpeg, image model, platform API, upload, draft synchronization, or publishing is a mandatory Promo dependency. A capable Agent host may generate a cover or call a media tool; Promo stores only the accepted artifact reference and provenance.

Acceptance: no title, cover, or summary introduces a claim absent from locked production evidence; the chosen package can be rendered as a local review artifact without a platform account.

## Implementation order and stop points

```text
F1/F2
  -> Node 2
  -> Node 3
  -> Node 4
  -> Node 5
  -> Node 6 Article Assembler
  -> Node 6 Cut Workbench adapter
  -> Node 7
```

The state-machine connection now covers Nodes 1–7 using the same three public MCP tools. The next delivery seam is concrete adapter work: a configured Cut Workbench bridge and the Article Assembler's document/preview producer. Do not add adapter dependencies to the core service.
