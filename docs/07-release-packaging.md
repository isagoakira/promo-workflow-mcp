# Node 7: Release Packaging

## Purpose

Package one locked video or article revision for release without reopening its content. Video and article share the state and one-selection interaction; the release text and final preview differ by carrier.

## State transition

```text
PRODUCTION_LOCKED -> PACKAGING -> RELEASE_READY
```

`promo_run` reads the locked production revision, verified evidence, platform context when present, and CTA, then creates:

- three concise title candidates;
- two finished cover candidates;
- one introduction for video or one summary for article;
- one review action.

`promo_commit` selects one title and one cover and accepts or edits the release text. No additional Grill is used. A focused cover correction may repeat the same `PACKAGING` action; it does not reopen Node 6.

## Title

The three candidates should represent different honest entry points:

1. a concrete result or contradiction;
2. a recognizable user situation;
3. the locked product-value judgment.

Every title must be repaid by the locked work. Do not add unseen metrics, universal claims, fake urgency, or a promise the opening cannot support. Article candidates may refine Node 4 title directions but must be derived again from the final platform branch.

## Cover

Prefer an accepted product frame, person, screen, result, or evidence-bearing image from Node 6. Keep one visual focus and one short readable phrase. The two candidates differ in composition, not factual claim, and both preserve their source artifact IDs.

For video, default to local FFmpeg composition: extract accepted frames, rank them by subject clarity, evidence value, thumbnail readability, and copy-safe space, then render evidence/result and person/scenario layouts.

For article, use the accepted asset manifest and the target platform profile to render two lightweight local layouts. The cover does not require a platform API or pixel-perfect backend emulation.

AI is a fallback only when accepted material cannot support the composition. It may extend a background, clean a non-factual area, or add decoration; it may not repaint the product, UI, people, evidence, or measured results.

The renderer stays inside Promo Service and runs as part of `promo_run(PACKAGING)`. It does not add a public MCP tool.

## Release text

Video receives one compact introduction that states the user situation, what the video demonstrates, and the resulting user value.

Article receives one compact summary suited to the locked platform profile. It must describe the final article without adding a new claim, conclusion, or CTA.

`geek-product-promo-writing` supervises wording and promotional temperature. Evidence lineage from the locked production revision remains authoritative.

## Article final preview analogue

After article selection, Node 7 rebuilds one final local preview analogue containing the chosen title, cover, summary, and locked body revision. It does not synchronize a platform draft or publish.

## Output

Video `RELEASE_READY` stores:

```text
title
coverArtifactId
introduction
confirmedAt
```

Article `RELEASE_READY` stores:

```text
title
coverArtifactId
summary
platform
productionRevision
finalPreviewArtifactId
confirmedAt
```

Production artifacts and lineage stay referenced through Node 6 rather than copied into the release package.
