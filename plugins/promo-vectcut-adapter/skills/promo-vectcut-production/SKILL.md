---
name: promo-vectcut-production
description: Use the installed VectCut adapter only for an active Promo Workflow video production node that reports the vectcut capability as configured. Do not use for storyboarding, standalone edits, or to claim an editable draft is a final video.
---

# VectCut Production Adapter

Start with `promo_get`. Use this adapter only when the workflow is in video production and its `adapterStatus` reports `vectcut` as installed and configured.

Promo creates an editable VectCut draft from accepted production units, the locked timeline, and the locked SRT. The draft is not a rendered or published video.

- Do not alter the locked timeline, material requirements, or subtitle plan outside the workflow revision path.
- If the endpoint is absent, present the returned capability gap and ask the user to configure or choose another production route.
- Before locking production, require the workflow's own review and acceptance evidence; a VectCut draft URL is only a handoff reference.
