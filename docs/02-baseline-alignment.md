# Node 2: Baseline Alignment

## Purpose

Use the locked topic, collected materials, product context, and inferred user intent to help the user confirm two content baselines.

## Input

- Locked topic
- Selected source materials
- Product positioning and capabilities
- Active campaign lines
- Current understanding of the user's intent

## Interaction

1. `promo_run` creates a baseline `agentWork` capsule from the locked topic and materials.
2. The Agent recommends a `core_message` and `guidance_intent` through `promo_commit(kind=propose_baseline)`.
3. Identify the most consequential unresolved choice.
4. Ask one question and include the recommended answer.
5. Save the user's answer with `promo_commit(kind=answer_baseline_grill)`.
6. Repeat through `promo_get` until the user confirms both fields.

## Output

```yaml
core_message: "The single idea the audience should remember"
guidance_intent: "What the audience should understand or do next"
```

## State transition

```text
TOPIC_LOCKED
  -> promo_run
  -> ALIGNING_BASELINE
       -> promo_get
       -> ask one question
       -> promo_commit(propose_baseline | answer_baseline_grill)
       -> ALIGNING_BASELINE
  -> promo_commit(lock_baseline)
  -> BASELINE_LOCKED
```

`promo_run` is not used in this conversational node. The durable record contains the confirmed baseline, not the full grill transcript.
