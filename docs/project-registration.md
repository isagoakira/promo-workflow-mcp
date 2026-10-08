# Recover projects by workspace

The project registry stores workspace locations and original workflow-data locations without copying videos, materials, or projects. The workbench and MCP share the registry, so registered projects remain discoverable across chats and restarts.

## Usage

- Connect an existing project: ask the assistant to register the workspace with `promo_register_project(rootDirectory)`. It checks only that directory, `data`, `.promo-workflow/data`, and the current instance's data directory, without recursively scanning disks.
- If old data is elsewhere, also supply `dataDirectory`. Registration is accepted only when state records actually belong to the specified workspace.
- List projects with `promo_projects`. The workbench's Registered Projects section also offers status checks and open links.
- Continue a project using its workflow ID with existing `promo_get`, `promo_run`, `promo_commit`, or video review tools. Execution returns to the original data directory and retains version checks, workspace permissions, and human review.
- MCP startup registers valid existing workspaces in the current data directory, then checks the registry. New workflows are registered automatically. Registration failure does not undo a saved workflow and produces an explicit message.

## Checks

Check workspace/state readability, current node and revision, video production stage and round, and deliverable-record existence. Offline directories, damaged records, and missing deliverables have distinct messages. If the same workflow ID appears in multiple data directories, the system refuses to guess which copy to use.

File existence does not establish content quality. Scanning does not play or copy all videos, replace human review, or advance nodes. Ordinary media directories without Promo state cannot yield inferred progress; import them through existing project-import and progress-review procedures.

## Storage

The default registry is `.promo-workflow/projects.json` under the user directory. Override it with `PROMO_PROJECT_REGISTRY`. Registration deduplicates real paths, uses file locks for concurrency, and refuses to overwrite a damaged registry. Different workspaces may retain different original data directories.

This version does not guess moved-project paths or silently replace registered data sources. Verify directory migrations and duplicate copies first.

## Validation

Isolated tests cover cross-workspace registration, restart recovery, path-alias deduplication, isolation from unregistered sibling projects, offline directories, missing deliverables, duplicate IDs, damaged-registry protection, and MCP/workbench writes to original data directories. Tests do not modify real projects.

2026-09-08: 82 tests passed. The workbench loaded two independent test workspaces and switched to another project's review video on the same page without copying media.
