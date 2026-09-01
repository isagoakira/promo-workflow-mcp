# Promo MCP

Local stdio adapter exposing `promo_get`, `promo_run`, and `promo_commit` to any MCP-capable Agent host. It has one runtime dependency: the MCP TypeScript SDK (which brings its schema validator).

The adapter is intentionally agent-neutral. It persists state in a JSON file chosen by `PROMO_WORKFLOW_DATA_DIR` (default: `<working-directory>/data/workflows.json`) and does not require Docker, a database server, platform credentials, or an installed video tool. Set `PROMO_VECTCUT_BASE_URL` to opt into the lightweight VectCut HTTP bridge; the core package adds no media dependency and otherwise returns its normal capability gap.

`promo_commit(kind=create_workflow)` starts either a `video` or `article` workflow. Every later `promo_run` or `promo_commit` carries `expectedRevision` and `idempotencyKey`; read the latest snapshot with `promo_get` before making a new decision.

During Node 6:

- `promo_get` returns `PRODUCING` with one pending action, or `PRODUCTION_LOCKED` with output IDs;
- `promo_run` advances automatic work behind the interface until it blocks, needs one human action, or locks;
- `promo_commit` persists the confirmed decision and returns the next state.

The MCP adapter does not expose or copy Cut Workbench or Article Assembler detail into the Agent context.

During Node 7, `promo_run` drafts the complete release package once, `promo_get` returns one selection action, and `promo_commit` selects the title and cover while accepting or editing the video introduction or article summary.
