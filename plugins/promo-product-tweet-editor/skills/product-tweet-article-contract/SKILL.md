---
name: product-tweet-article-contract
description: Establish an APPSO-style article contract at N2 of an active Promo Workflow article. Lock editorial focus, narrative persona, reader relationship, warmth thread, emotional arc, and factual boundaries; do not write an outline or full article here.
---

# APPSO-style article contract

Call `promo_guidance` and load `product-tweet-article-contract`. Focus on `appso-style-model`, `style-control-capsule`, `authorial-warmth`, and `evidence-standard`.

Write the stable upstream components of the style-control capsule into existing `articleEditorialIntent`:

- `readerDecision`: the decision the reader should ultimately form.
- `humanCenter`: the human situation, action, or product detail selected by editorial focus.
- `authorStance`: narrative persona, product relationship, and first-person permissions.
- `warmThread`: a thread of warmth throughout the article without excessive repetition.
- `emotionalArc`: how attention and emotion move from opening to ending.
- `evidencePosture`: factual draft, judgment permissions, disclosures, and unverified boundaries.
- `proseLooseness`: nullable 0–100 expression control, not a quality score. Set it only when the user explicitly chooses. Use the current `promo_guidance` section on current requirements and evidence-based recheck for mappings and audit rules; maintain no separate thresholds.

Warmth must come from observed scenes, habits, friction, pleasure, or small surprises. With insufficient material, use explicitly labeled reader situations, product-team positions, or attributable stories without inventing personal memories. Ask one Grill question only when its answer would change the whole article contract.
