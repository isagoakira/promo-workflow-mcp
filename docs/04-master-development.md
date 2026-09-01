# Node 4: Master Development

## Purpose

Expand the locked creative spine and carrier outline into one complete, reviewable master:

- video: a time-aligned storyboard master;
- article: a complete manuscript master.

This node decides the exact content and presentation. It does not shoot, generate, edit, render, lay out, publish, or export production derivatives.

## State transition

```text
OUTLINE_LOCKED
  -> promo_run(generate_master)
  -> GENERATING_MASTER
  -> ALIGNING_MASTER
       -> promo_get
       -> ask one blocking question, when needed
       -> promo_commit(master_grill_answer)
       -> ALIGNING_MASTER
  -> promo_commit(lock_master)
  -> MASTER_LOCKED
```

`GENERATING_MASTER` is transient. The first `promo_run` produces a complete initial master before any local polishing or Grill.

## Input

- Locked creative spine and carrier outline
- Selected content budget
- Confirmed evidence and material references
- Product context and active campaign lines
- `geek-product-promo-writing`
- `storyboard-direction` for video masters

## Generation and review order

1. Generate the complete video timeline or article manuscript.
2. Verify fidelity to the locked proposition, movement, evidence boundary, and ending.
3. Review macro, section, and local writing style.
4. For video, review shot intent, AV coordination, continuity, edit coverage, and timing.
5. Build and audit the shared cross-media asset plan.
6. Reconcile the whole master after local fixes.

The system fixes local wording, shot transitions, small timing deviations, and ordinary reuse improvements automatically.

## Limited Grill

Ask only when the answer changes at least one of these:

- a factual claim or evidence boundary;
- speaker identity, position, or promotional temperature;
- the overall rhythm or emphasis of the work;
- production burden in a material way;
- two valid approaches that produce meaningfully different work.

Question limits are hard caps, not quotas:

| Tier | Maximum questions |
| --- | ---: |
| Short | 2 |
| Standard | 3 |
| Long | 4 |

Ask zero questions when the master has no blocking choice. Ask exactly one question at a time and include the recommended answer. The Grill transcript is transient.

## Shared asset plan

The master plans assets as:

```text
source asset -> reusable fragment -> video or article usage
```

A source asset may be a talking-head take, interview, screen recording, product demonstration, B-roll setup, still image, transition animation, generated illustration, sound recording, or another open form.

Ordinary source assets should have at least two meaningful usages. A one-use asset is valid only when it is marked essential and carries a unique proof, opening, emotional turn, or ending. Reuse may cross media.

The asset plan records:

- production intent and factual constraints;
- evidence or presentation role;
- suggested production route without binding a tool;
- reusable fragments and transformations;
- all target usages;
- unique acquisition count, planned usage count, and justified one-offs.

Asset reuse may change implementation details, but it cannot change the locked proposition, story movement, or factual conclusion.

## Evidence and missing assets

These are different conditions:

- A missing fact that supports a core claim blocks `MASTER_LOCKED`.
- A known but unacquired recording, image, animation, or generated asset does not block. Record it in the asset plan for Node 5.
- Decorative assets do not block.

AI-generated material may satisfy illustration, B-roll, previz, or transition needs. It must not be represented as proof of a real product execution, interview, customer reaction, measurement, or documentary event.

## Video master

The time-aligned storyboard is the video's single source of truth. Each shot or continuous passage records:

```yaml
id: "S01"
timeRange: { startMs: 0, endMs: 8000 }
shotPurpose: "What this advances"
spokenContent: "Dialogue, interview audio, narration, or null"
sound: "Music, SFX, room tone, silence, or null"
visualAction: "What is visibly happening"
composition: "Framing and focal hierarchy"
cameraBehavior: "Angle, shot size, focus, and movement when needed"
onScreenText: "Text or null"
evidenceRefs: []
assetUsageIds: []
transition: "Picture or sound connection"
```

Shot ranges are continuous and total exactly 120, 300, or 600 seconds. Spoken content may be absent. There is no cut-frequency rule, fixed storyboard grid, voiceover occupancy target, or ban on consecutive talking-head passages.

`storyboard-direction` supervises the video master. `geek-product-promo-writing` supervises the spoken and narrative writing.

## Article master

The article's single source of truth contains:

- one title and useful alternatives;
- the complete Markdown body;
- final macro, section, and local writing treatment;
- evidence boundaries and source-preserving claims;
- shared-asset placements and editorial purposes;
- at most one primary call to action.

Public-account layout, image production, cover, summary, and platform delivery belong to downstream nodes.

## Lock conditions

Advance to `MASTER_LOCKED` only when:

- the master preserves the locked outline and baseline;
- no core factual claim lacks evidence;
- `geek-product-promo-writing` review passes;
- `storyboard-direction` review passes for video;
- video time ranges are continuous and equal the selected duration;
- the article is complete and internally coherent for article work;
- all planned asset usages reference a source asset;
- ordinary source assets have at least two usages or a one-off justification;
- no unresolved choice can materially change the work.

Only the locked master, reviews, and shared asset plan are durable.
