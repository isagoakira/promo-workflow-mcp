# Node 6: Production Execution

## Purpose

Turn the Node 5 requirement set into one locked, reviewable production revision. Video and article work share the same Promo state and unit lifecycle but use different internal backends.

## State transition

```text
REQUIREMENTS_READY -> PRODUCING -> PRODUCTION_LOCKED
```

Promo stores only the carrier, backend reference, compact `production_unit` references, one current human action, blockers, and locked output artifact references. Backend detail never becomes a second Promo state machine.

| Carrier | Backend | Backend truth |
| --- | --- | --- |
| Video | Cut Workbench or VectCut | Video stages, revisions, generation jobs, editor sync, verification, and handoff |
| Article | Article Assembler | Platform branch, content-block revision, asset manifest, and preview analogue |

## Shared production units

Each unsatisfied merged requirement becomes one unit with requirement references, one route, a status, and dependencies. Accepted existing material is reused directly rather than wrapped in a new unit.

Routes are `human`, `generative`, or `local`. Mixed work becomes dependent units instead of an opaque hybrid route. Statuses are `queued`, `active`, `waiting_human`, `review`, `accepted`, and `needs_replan`.

Route automatically:

1. Real product appearance, people, actual results, and operational evidence require accepted real material or human capture.
2. Deterministic transformations use local tools.
3. Non-factual atmosphere, concepts, transitions, and explanatory illustration may use generation.
4. Otherwise prefer accepted reuse, local processing, generation, then new human work.

A confirmed capability gap enters `needs_replan` and returns to Node 5. Temporary failures remain internal attempts.

## One human-action interface

At most one action is exposed through `promo_get`:

```text
{ id, kind: produce | approve | review | resolve, instruction }
```

`promo_commit` returns the action ID and the user's response. Detailed capture packs, candidate sets, evidence, limits, and conflict records stay inside the backend.

## Video backend

Cut Workbench owns video-production stages, immutable revisions, artifacts, generation jobs, editor synchronization, verification, and handoff. Promo stores only its project and revision reference.

Rough cut starts when the narrative spine and factual evidence are usable. Non-critical B-roll, transitions, animation, and supplemental voice may remain placeholders and finish in parallel. Timestamped feedback becomes an edit plan; external editor changes return through Cut Workbench sync.

The Node 5 SRT is planned timing. The final SRT is regenerated from the audio actually heard after fine cut. Production locks only after essential units, rough-cut review, final review, subtitle synchronization, Cut Workbench verification, and its final gate pass.

Later video changes branch the locked Cut Workbench revision instead of overwriting it.

### VectCut draft path

VectCut is an optional low-install path, selected with `context.videoBackend: "vectcut"`. It does not create a second workflow. The existing production-unit route, acceptance results, `promo_run`, one pending review action, and `lock_production` remain unchanged.

After all units are accepted, the adapter requires a URL mapping for every locked `assetUsageId`. It creates a VectCut draft, places the supplied clips on the locked master timeline, imports Node 5's SRT, saves the editable draft, and stores only its draft reference as an immutable Promo artifact. The next action is a single human review in VectCut/剪映/CapCut.

- A change sends the affected unit back through `update_production_units`; that invalidates the old draft and the next `promo_run` rebuilds it.
- A review accepts the draft with `vectcutDraftAccepted: true` and a non-empty `vectcutReviewNote` in `lock_production`.
- A VectCut lock has delivery mode `editable_draft`, not `final_video`; export remains an explicit editor-side act.

Promo has no VectCut runtime dependency. A host may provide the local endpoint through `VectCutHttpBridge`; an absent endpoint returns `capability_gap`.

## Article platform branch

One article-production branch targets exactly one platform. Multiple platforms branch from the same locked master and may reuse accepted assets, but each branch locks its own platform profile and production revision.

```text
MASTER_LOCKED
├── platform branch A
├── platform branch B
└── platform branch C
```

The local, versioned platform profile contains:

- hard constraints that must pass;
- soft presentation preferences;
- one lightweight `preview_analogue` render preset;
- the references and check time used for the profile.

Profiles refresh only when needed. Updating a profile never rewrites an existing branch.

## Article adaptation boundary

Article Assembler may adjust paragraph boundaries, heading levels, local order, information density, transitions, image placement, captions, references, link placeholders, CTA presentation, and layout devices.

It may not change the confirmed core message, guidance intent, core section purpose, fact-to-evidence relationship, conclusion, author position, or promotional temperature. A platform that requires a shorter carrier, a new narrative, or removal of core evidence receives a new Node 3 or Node 4 branch.

## Article truth source

The article production source of truth is one ordered content-block document. Supported block types are:

```text
heading, paragraph, image, quote, callout,
code, table, divider, cta
```

Each block has a stable ID, type, content, optional asset reference, and source-master reference. Markdown, HTML-like exports, and previews are derivatives and may always be rebuilt.

The MVP locks only three article artifact references:

```text
documentArtifactId
previewArtifactId
assetManifestArtifactId
```

The preview is a local analogue, not a pixel-perfect clone of the target platform. It must make the current working title, body structure, asset order, captions, references, link placeholders, CTA, reading width, and overall rhythm reviewable. Node 7 adds the final title, cover, and summary.

Platform APIs, draft IDs, draft synchronization, exact backend layout, upload, and publishing are outside the MVP.

## Article review

Accepted assets, deterministic transformations, and ordinary layout pass automatically. Review is requested early only when product identity, people, brand expression, AI authenticity, factual evidence, paid generation, or new human capture is uncertain.

After all units finish, one complete preview-analogue review is mandatory. Feedback is merged into one `review` action and produces a new document revision before another complete preview is rendered.

## Article lock

Advance an article branch to `PRODUCTION_LOCKED` only when:

1. all required units are accepted;
2. the content-block document covers the locked master without semantic drift;
3. every image, datum, reference, and link has valid lineage;
4. all hard platform constraints pass;
5. the document, preview analogue, and asset manifest reference the same revision;
6. the user accepts the complete preview analogue.

The lock stores the parent master revision, platform, platform-profile version, Article Assembler revision, three output artifact IDs, and lock time. Later changes branch the locked revision rather than overwriting it.
