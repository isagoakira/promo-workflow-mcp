# Completion Plan: Production Adapters and Final Acceptance

## Goal

Finish the MVP without changing its boundary: Promo remains a lightweight state and artifact authority. It never embeds a renderer, video editor, platform API, or a heavyweight media dependency.

The remaining work has two independent production adapters sharing the existing `REQUIREMENTS_READY -> PRODUCING -> PRODUCTION_LOCKED` control plane:

```text
locked master + requirement set
  ├─ article: local Article Assembler -> document + manifest + HTML preview
  └─ video: configured Cut Workbench bridge -> verified final outputs
             or VectCut bridge -> reviewed editable draft
```

The public MCP surface remains `promo_get`, `promo_run`, and `promo_commit`.

## Phase A — establish the shared production-result handoff

**Status: implemented.**

### A1. Add one internal production-result shape

Extend a production unit only with durable outcome references: accepted local artifact IDs, a source/provenance note, and the backend revision that accepted them. Route, requirement IDs, and dependencies stay immutable after planning.

`promo_commit(kind=update_production_units)` remains the only progress write. It may change a status and attach accepted results, but may not create ad-hoc units or alter the locked requirement set.

### A2. Keep review and capability boundaries intact

- `human`, `generative`, and `local` remain the only routes.
- A missing backend returns a `capability_gap` / `needs_replan`; it never silently falls back to a different route.
- Product identity, people, factual evidence, new human capture, and uncertain generated material remain visible to the one review action.

Acceptance: result references survive a restart and are the only evidence later adapters and Node 7 can cite.

## Phase B — Article Assembler production bridge

**Status: implemented.**

### B1. Deterministically assemble the branch

For an article workflow with a supplied local platform profile, `promo_run` in `PRODUCING` assembles one branch from the locked article master and accepted production results:

1. Build a versioned `ArticlePlatformBranch` from the locked master artifact and profile.
2. Convert the master Markdown and asset placements into the ordered content-block document.
3. Build an asset manifest from the accepted result references.
4. Render the local HTML preview analogue.
5. Store all three as immutable Promo artifacts with one matching document revision.

No external platform is called. A profile that is absent, malformed, or incompatible remains a visible blocker rather than an inferred default.

### B2. Make the preview the actual lock gate

`promo_get` exposes the single complete-preview review action returned by `getArticleReviewGate`. `lock_production` for articles must read the stored document/manifest/preview bundle, require `previewAccepted: true`, and reject hard constraints, semantic drift, missing lineage, or mismatched revisions.

Acceptance: an article can reach `PRODUCTION_LOCKED` without manually inventing the three output IDs; the lock owns a locally reviewable preview artifact.

## Phase C — Cut Workbench narrow bridge

**Status: contract implemented; real bridge configuration and smoke pending.**

### C1. Discover and freeze the external contract

The Cut Workbench checkout is not currently present in the local workspace, so this phase starts with a read-only contract audit of its current local/API interface. The bridge is defined only after confirming how it creates/opens a project, advances a revision, reports unit status, verifies a final cut, and exposes output artifacts.

The internal bridge must accept the locked video master, requirement set/SRT, and accepted result references; it returns only:

```text
projectId, revision, unit status updates, verified output artifact IDs, final subtitle reference, final-gate result
```

### C2. Make activation explicit and optional

The core service carries an adapter interface with an unavailable implementation by default. A local configuration selects a compatible Cut Workbench bridge; no Cut Workbench dependency is installed with Promo.

`promo_run` advances only safe bridge work. Human actions, review requests, or unavailable capabilities return through the existing production-unit control plane. Video lock requires every essential unit accepted, a verified final gate, and final subtitle lineage.

Acceptance: an unconfigured machine runs article workflows normally; a configured machine locks a video using only its Cut Workbench project/revision and verified output references.

## Phase D — acceptance suite and documentation

**Status: article end-to-end and bridge-contract tests implemented; real Cut Workbench smoke pending.**

### D1. VectCut low-install execution path

**Status: implemented and HTTP-contract tested.**

`VectCutHttpBridge` uses the local service's create-draft, clip-import, SRT-import, and save-draft calls through native `fetch`; it adds no package dependency to Promo. The selected backend remains an explicit workflow context field (`videoBackend: "vectcut"`).

Its handoff is deliberately draft-first:

```text
accepted production units + asset-usage URL map + locked SRT
  -> VectCut editable draft
  -> one human editor review
  -> PRODUCTION_LOCKED (deliveryMode: editable_draft)
```

An edit is not patched around the state machine: `update_production_units` clears the prior backend result, returns the affected units to execution, and the subsequent run constructs a new draft. An editor-side export is not misrepresented as an automatic Promo render.

1. Add a complete article workflow test: topic through local document, manifest, preview review, production lock, package selection, and `RELEASE_READY`.
2. Add Cut Workbench bridge contract tests using a small fake adapter; do not add the real application as a test dependency.
3. Run one real local Cut Workbench smoke only after its checkout/configuration is available.
4. Verify restart/replay, stale revision rejection, unavailable-adapter behavior, evidence-lineage rejection, and no-platform-API operation.
5. Update the README and plugin guidance with the exact optional-adapter setup and the definition of “complete”.

## Completion definition

The workflow is ready to declare complete when:

- video and article both reach `RELEASE_READY` via the same three MCP tools;
- article production creates and gates a local preview itself;
- video production has passed a real configured Cut Workbench smoke and its contract suite;
- every production/release claim traces to immutable accepted artifacts;
- no platform upload/publish API or mandatory external media dependency has been introduced.
