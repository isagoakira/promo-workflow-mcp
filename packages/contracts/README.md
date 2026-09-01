# Contracts

Shared state, capsule, decision, and result schemas live here as each workflow node is confirmed.

The current contract covers topic selection, baseline alignment, creative-outline alignment, master development, automatic material-requirement compilation, dual-backend production, and carrier-specific release packaging.

Node 6 is intentionally split across small files. `src/production.ts` contains the shared unit lifecycle and the carrier/backend capsule. `src/article-production.ts` contains the ordered article document and its three artifact references. `src/platform.ts` contains versioned platform profiles and single-platform branches. Detailed backend state remains behind the Cut Workbench or Article Assembler seam.

Node 7 is isolated in `src/release.ts`. It exposes only title candidates, cover artifact candidates, one video introduction or article summary, one selection action, and the locked release package. Article release also references its final local preview analogue.
