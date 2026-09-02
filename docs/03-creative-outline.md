# Node 3: Creative Spine and Outline Alignment

## Purpose

Turn the locked topic and baseline into two linked outputs in the same node:

1. one cross-media creative spine;
2. one outline adapted to the current carrier and length tier.

This node decides what the content is doing and how it moves. For video it also locks a **大纲脚本**: a segment-level bridge between the creative route and the storyboard. It does not write the finished article, the line-by-line spoken script, the shot-by-shot production plan, or SRT subtitles.

## State transition

```text
BASELINE_LOCKED
  -> promo_run(generate_creative_outline)
  -> GENERATING_CREATIVE
  -> ALIGNING_OUTLINE
       -> promo_get
       -> ask one high-impact question
       -> promo_commit(outline_grill_answer)
       -> ALIGNING_OUTLINE
  -> promo_commit(lock_outline)
  -> OUTLINE_LOCKED
```

`GENERATING_CREATIVE` is transient. `promo_run` creates the initial recommendation. The conversational loop uses `promo_get` and `promo_commit`; it does not require another `promo_run` for every answer.

## Input

- Locked topic and selected materials
- Product positioning and capabilities
- Active campaign lines
- Confirmed `core_message`
- Confirmed `guidance_intent`
- Current carrier: video or article
- Current length tier

## Creative spine

Generate one creative spine before adapting it to a carrier. It contains:

- `creativePremise`: the main creative idea derived from the baseline;
- `storyEngine`: the narrative mechanism;
- `narrativeAnchor`: the task, situation, failure, or observation that holds the piece together;
- `openingMove`: how the audience enters the story;
- `progression`: how tension, action, evidence, and understanding develop;
- `proofPlan`: how the major claims will be supported;
- `endingMove`: where the content leaves the audience;
- `macroStyle`: speaker position, reader relationship, promotional temperature, technical depth, emotional arc, and ending altitude.

The default story-engine suggestions are:

- single-task evidence chain;
- before/after workflow;
- stress-test ladder;
- engineering-origin story.

They are suggestions, not a closed enum. The agent may propose a custom engine when the materials do not fit one of them.

## Macro style supervision

The Injector applies the `geek-product-promo-writing` Skill at the macro level while generating and reviewing the creative spine and outline.

The review checks:

- honest and stable speaker identity;
- clear reader relationship and central proposition;
- one coherent narrative engine;
- consistent promotional temperature, technical depth, emotional arc, and ending altitude;
- sections or segments with distinct jobs rather than a repeated template;
- evidence placed at the scale of the claim;
- one primary call to action at most.

Sentence-level editing is deliberately excluded. Micro wording rules belong to the fourth node after a complete draft or script exists.

## Length adaptation

| Tier | Video | Article | Beats | Target grill questions |
| --- | --- | --- | --- | --- |
| Short | 2 minutes | 800–1,500 Chinese characters | 4 | 2–3 |
| Standard | 5 minutes | 2,000–3,500 Chinese characters | 5–7 | 3–5 |
| Long | 10 minutes | 4,000–6,000 Chinese characters | 7–8 | 4–6 |

These question ranges are targets, not quotas. Lock early when no high-impact uncertainty remains; never exceed six questions. Longer formats add evidence, explanation, obstacles, and synthesis depth rather than adding another promotional core.

## Grill order

Move from macro to carrier-specific detail:

1. Creative premise, narrative anchor, and story movement
2. Evidence order, section jobs, and unresolved claims
3. Carrier pacing and presentation choices

Ask exactly one question at a time and include the recommended answer. Ask only when the answer can change multiple beats, the evidence strategy, or the audience's final understanding. Do not ask about isolated wording, decorative visuals, subtitle phrasing, or shot-level execution in this node.

The full grill transcript is transient. The locked creative spine and carrier outline are durable.

## Video outline

Video duration means final edited duration, not spoken duration. Segment durations must sum to exactly 120, 300, or 600 seconds.

Each segment requires:

- `durationSeconds`;
- `segmentPurpose`.

The following fields are open and may be empty:

- `speaker`;
- `speakerAction`;
- `spokenFunction`;
- `presentation`;
- `visualFunction`;
- `evidence`;
- `transition`.

`segmentPurpose` is primary. Speech and presentation are implementations of that purpose. A presenter may explain a product, interview a founder, share an experience, react to a result, or perform another useful action. Direct-to-camera, narration, interview, demo, animation, mixed presentation, and visual-only passages are all valid. There is no required voiceover or subtitle occupancy ratio.

The video outline also records its hook and first visible frame, unsupported claims, ending, and at most one primary call to action. On lock the service writes `03-creative-outline/outline-script.json`; each beat exposes its narrative task, presenter direction, visible promise, proof target and transition. This is deliberately not a rough article or a miniature storyboard: it prevents Node 4 from inventing the evidence and scene logic during expansion.

## Article outline

Each section requires:

- `sectionPurpose`: what this section advances;
- `content`: what it will actually develop.

The following fields are open and may be empty:

- `readerShift`;
- `evidence`;
- `authorJudgment`;
- `transition`;
- `visualAsset`.

Sections may set a scene, tell a story, explain a mechanism, present evidence, create a turn, synthesize a judgment, or guide an action. They must not be forced into the same fact-explanation-summary cycle.

The article outline also records its opening direction, optional title directions, unsupported claims, ending, and at most one primary call to action.

## Lock conditions

Advance to `OUTLINE_LOCKED` only when:

- the creative spine preserves the confirmed `core_message` and `guidance_intent`;
- the carrier outline follows the same spine without mechanically copying another medium;
- no unresolved decision would materially change multiple beats;
- each major claim has evidence or is explicitly listed as unsupported;
- the macro style review passes;
- the beat count fits the selected tier;
- video segment durations equal the selected final duration, when the carrier is video;
- article sections have distinct purposes, when the carrier is article;
- the ending and primary call to action are clear.

## Durable output

```yaml
topicId: "..."
budget: "video/article tier and target"
creativeSpine: "cross-media creative structure"
outline: "video segments or article sections"
outlineScript: "video only: segment task -> visible promise -> proof target"
macroStyleReview: "geek-product-promo-writing macro review"
confirmedAt: "ISO-8601 timestamp"
```
