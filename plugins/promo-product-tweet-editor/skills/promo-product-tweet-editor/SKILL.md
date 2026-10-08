---
name: promo-product-tweet-editor
description: Apply and review the specified APPSO editorial style within active Promo Workflow article nodes, covering the article contract, structure, complete master, visual proof, preview review, and release packaging. Use only for managed technology product articles, not raw topic fetching, video-only tasks, or standalone imitation.
---

# Technology product article editing: specified APPSO style

This is the style-control entry point for active campaign workflows. Transfer APPSO's editorial methods without copying sentences, title formulas, publication identity, or author identity.

## Read authoritative workflow state first

Call `promo_get`, then `promo_guidance` with the policy IDs in current `agentWork.guidance`. Complete guidance, resource lists, factual drafts, locked artifacts, and evidence boundaries returned by MCP are authoritative inputs for the node. Plugin skills load and execute them correctly without bypassing the state machine.

## Load by node

- N2: `product-tweet-article-contract` locks editorial focus, narrative persona, reader relationship, warmth thread, and factual boundaries.
- N3: `product-tweet-human-center-outline` arranges attention flow, proportion ranges, and paragraph roles.
- N4: `product-tweet-manuscript-proof` transfers style at macro, paragraph, and sentence levels.
- N4/N6 materials: `product-tweet-visual-proof` places visuals where they prove or explain something.
- N6: `product-tweet-preview-review` checks overall style drift after layout.
- N7: `product-tweet-release-packaging` compresses the article into titles, summaries, cover copy, and a lingering impression.

## Boundaries

- Never invent firsthand use, test duration, product behavior, measurements, quotations, user reactions, or independent-reviewer status.
- Do not make scores, numbers, or comparisons the main substance of the style.
- Start with editorial focus and reader relationship, not sentence or title imitation.
- Later nodes must not rewrite locked article propositions, narrator permissions, or factual boundaries retroactively.
- If evidence is missing, narrow claims or return for evidence; do not polish uncertainty into certainty.
