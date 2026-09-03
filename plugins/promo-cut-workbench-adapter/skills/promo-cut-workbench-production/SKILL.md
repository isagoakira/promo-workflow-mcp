---
name: promo-cut-workbench-production
description: Use the installed Cut Workbench adapter only for an active Promo Workflow video production node that reports the cut_workbench capability as configured. Do not use for storyboarding, standalone edits, or an unconfigured adapter.
---

# Cut Workbench Production Adapter

Start with `promo_get`. Use this adapter only when the workflow is in video production and its `adapterStatus` reports `cut_workbench` as installed and configured.

The Promo Workflow MCP remains the source of truth for production units, acceptance, and locking. Cut Workbench owns editor operations and project details.

- Do not create a new production route or bypass an unresolved production unit.
- Give the user the returned capability gap or blocker in plain language when the adapter is not configured.
- Keep every returned artifact, revision, and review outcome attached to the existing workflow through the MCP; a Cut Workbench project alone is not a locked Promo production result.
