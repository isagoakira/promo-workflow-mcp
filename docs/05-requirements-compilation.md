# Node 5: Requirements Compilation

## Purpose

Translate the locked master from consumption-side usages into the smallest tool-independent set of material requirements needed to realize it.

This node describes what must exist and why. It does not choose the final production workflow or create the assets.

## State transition

```text
MASTER_LOCKED
  -> promo_run(compile_requirements)
  -> COMPILING_REQUIREMENTS
  -> REQUIREMENTS_READY
```

The node is fully automatic and has no normal Grill or `promo_commit` step.

## Compilation

1. Read every asset usage in the video or article master.
2. Merge usages that can be satisfied by one source capture, recording, existing asset, or generation.
3. Group work by compatible presenter, location, camera, lighting, wardrobe, prop, interview, product, UI, or animation setup.
4. Preserve every factual, continuity, aspect, timing, identity, and product constraint.
5. Produce the smallest set of requirements that still covers every usage.
6. Keep essential one-off requirements only when their unique function is recorded.

## Requirement shape

```yaml
id: "R01"
purpose: "What this material enables"
specification: "Duration, aspect, content, and continuity needs"
constraints: []
coveredUsageIds: []
reusableFragmentIds: []
preferredRoute: "Existing, human, generative, local, or another suggestion"
priority: "blocking, required, or optional"
```

`preferredRoute` is advisory. Requirements must remain usable when the production toolchain changes.

## SRT derivation

For video, Node 5 also segments the exact spoken material and planned timing from the video master into a ready-to-write SRT artifact with a filename, serialized content, and structured cues:

```yaml
index: 1
startMs: 0
endMs: 2400
text: "Subtitle text"
```

Article requirements do not contain subtitle cues.

## Output

For video, Node 5 produces one **pre-production material plan**: `preproduction-material-plan.json`. It is the single source of truth for all material-side work before production. It groups every requirement by high-reuse source capture and records the locked CAM/VO boundary, environment and continuity checks, continuous capture path, required visible states, edit handles, backup strategy, source fragments, capture order, acceptance and downgrade boundary.

The plan does not allocate people or tools. A real proof state that cannot be captured is not allowed to silently degrade into B-roll or graphics; it returns to Node 4 to remove or revise the claim.

The durable requirement set contains:

- the minimum material requirements;
- the usage IDs covered by each requirement;
- planned reusable fragments;
- production suggestions and priorities;
- unique acquisition count, planned usage count, and justified one-offs;
- a serialized SRT artifact and structured cues for video.

Advance to `REQUIREMENTS_READY` only when every asset usage is covered and every constraint from the master is preserved.

## Node 6 coordination

Node 6 owns capability matching, actual workflow selection, capture, AI generation, rendering, editing, and artifact status.

It converts each merged requirement into one `production_unit`. A unit has exactly one `human`, `generative`, or `local` execution route. Mixed work is split into dependent units instead of using an ambiguous hybrid route.

It may reroute a requirement when purpose, factual boundary, continuity, and required output remain intact. When it cannot satisfy a requirement, it returns:

```yaml
requirementId: "R01"
reason: "Why the current production capabilities cannot satisfy it"
availableCapabilities: []
preservedConstraints: []
```

This `capability_gap` sends the requirement back for automatic merge, substitution, or simplification. User input is needed only when every valid alternative would materially change the locked master.
