# Video production and review implementation

## Ownership

Promo owns the approved storyboard, narration, minimum recording guide, production requirements and replanning. Cut Workbench executes one production node using actual assets, editable operations, preview files and evidence. It does not introduce another planning stage machine.

The review workbench is the human feedback surface. A point, one interval, or multiple intervals may be selected; each selection can include a normalized spatial rectangle. An annotation belongs to the exact preview version the user viewed, never merely the latest timeline position.

## Implementation assignments

| Owner | Scope | Required evidence |
| --- | --- | --- |
| Cut backend | Single-node execution protocol, legacy history compatibility, preview/annotation/check records, delivery gate, public MCP operations | Python state-transition and stale-evidence tests |
| Promo backend | Plan handoff, real stdio bridge, persistent video feedback, planning versus execution routing | Service and cross-process tests |
| Review UI | Playback, timeline point/range/multi-range selections, rectangle selection, comments and review lifecycle | Host security and browser interaction tests |
| Integration | Shared contract, dual-repository regression checks, documentation and handoff | Real TypeScript-to-Python exchange and review flow |

Existing uncommitted article-review work must be preserved. Do not alter real runtime projects or migrate stored production data implicitly.

## Shared selection semantics

- Time uses milliseconds from the start of the referenced preview.
- A point has equal start and end; an interval has start less than end.
- Multiple selections belong to one annotation and retain their own time and optional rectangle.
- Rectangles use x, y, width, height in [0, 1] relative to the displayed video content, excluding letterboxing.
- An immutable preview identifier and content hash identify the reviewed media.
- After a new preview, old annotations retain their original reference. Any remapping must be explicit.
- Agent-addressed feedback remains pending human review. Planning feedback goes back to Promo.
- Revision comparison uses two real videos on the same screen: original on the left and replacement on the right. Each player has its own time position. Linked playback requires explicit alignment and preserves the chosen offset; it must not imply that identical seconds mean identical content after edits.

## Acceptance

1. A new handoff does not create or require the legacy nine-stage workflow.
2. Missing media or analysis capability produces an explicit unresolved result, not a pass.
3. The user can play a real preview, select a point or several ranges, attach rectangles and text, save, reload, and jump back to the selection.
4. Range streaming and review writes respect existing host authorization and allowed artifact roots.
5. Preview replacement invalidates approval. Unknown or failed checks and unresolved annotations prevent delivery.
6. Resolving feedback requires review of the identified resulting preview; executing an edit alone cannot close it.
7. Existing article review and historical Cut projects remain readable and their regression tests pass.
8. The comparison view plays both registered preview versions, retains the original annotation rectangle, and supports independent positioning before linked playback.

## Scope boundary

This change supplies the execution/review protocol and workbench. A configurable analysis interface is not evidence that a video model or editor renderer is installed or has run. Reports must distinguish verified local preview operations, model inspection, human review, and unavailable providers.

## Verification recorded 2026-09-08

- Cut Workbench: 104 Python tests passed, including actual ffmpeg/ffprobe fixtures and H.264 inspection clips.
- Promo: build passed; 13 MCP host tests and 56 service tests passed.
- `scripts/test-cutbench-integration.mjs`: real TypeScript-to-Python MCP round trip, immutable preview ingestion, bounded inspection output hashes, multi-range spatial annotation, fix/resolve/reopen, additive material input, and changed-plan isolation passed.
- Browser: actual MP4 playback, point/multi-range/rectangle input, persistence, historical seek, human review, failed-request draft retention, side-by-side comparison, and explicit linked playback offset passed. Existing article-review browser flow also passed.

Reproduce the cross-repository check after `npm run build` using `CUTBENCH_PYTHON=/path/to/python3.11-or-newer node scripts/test-cutbench-integration.mjs`. Set `CUTBENCH_SOURCE` if CutWorkBench is not a sibling checkout. ffmpeg/ffprobe must be on PATH. The script creates and removes its own temporary runtime only.

These checks validate protocol and user interaction, not semantic model accuracy on a real editorial project. No existing runtime data was migrated and no production process was replaced.
