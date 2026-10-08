# Integrating article quality loops and video review

Changes from two chats occupy the same working directory. This integration preserves all uncommitted changes without migrating or rewriting real workflow data, or merging the Mac updates not yet integrated into the CutWorkBench remote.

## Retained responsibilities

- Article masters: fixed reading checks → on-demand repair cards by issue code → evidence from old/new text → recheck. Automatic passing remains distinct from human approval.
- Video planning: Promo supplies storyboards, voiceover, and recording material plans using video-specific guidance.
- Video production: CutWorkBench's single execution node handles actual media, previews, and revisions; expression-direction changes return to Promo.
- Video review: points, ranges, multiple ranges, and rectangles bind to immutable versions. Revision receipts do not replace human confirmation; unresolved feedback blocks final locking.
- Workbench: articles and videos retain separate review data and gates, share right-sidebar styling, and support dual-video comparison.

## Integration fixes

1. Align article task briefs with on-demand guidance; remove obsolete preloading instructions and specify judgment / repairs / recheck deliverables.
2. Permit article issue codes only at the article master node, never in video guidance requests.
3. Add regression tests for articles/videos in the same service, checking old-task guidance updates, on-demand repair, carrier isolation, and read-only queries preserving revisions.

## Validation entry points

- `npm run build` and `npm test`.
- `packages/promo-mcp/test/text-desk-browser.mjs` and `video-desk-browser.mjs`: annotations, original-version anchors, revision comparisons, and human confirmation.
- `scripts/test-cutbench-integration.mjs`: actual CutWorkBench interfaces, real media, and gates.

Verify real-media compatibility separately in the delivery browser. The current sample's 360p-compatible version is about 2 MB; the original and old annotations were not overwritten. Synthetic-media tests do not replace actual sample playback acceptance.

## Results

2026-09-08: full build passed; 70 Promo tests (13 MCP, 57 service) and 104 CutWorkBench tests passed. Article/video browser regressions and real Promo→CutWorkBench integration passed. Changes remained local and uncommitted, with no remote push or real-content migration.
