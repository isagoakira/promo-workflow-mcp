# Promo Service

Owns the workflow state machine, context Injector, Web Fetch, bidirectional matching, and local persistence.

The Node 1 runtime delegates retrieval to the Agent host's Web Fetch or browser capability; it has no crawler, browser, feed-parser, database, or cloud dependency. A workflow supplies a compact `productProfile` and 1–10 `topicSources`. `promo_run` emits a `fetchBrief`; the Agent returns 1–50 source-preserving topic cards through `promo_commit(kind=submit_fetched_topics)`; a second `promo_run` ranks only the Top 3 candidates using product-capability/campaign overlap plus source weight and publication recency. It persists candidate cards and reasons, never raw source bodies.

For video production it also owns provider-neutral `production_unit` scheduling. Narrow adapters call Cut Workbench or VectCut; the service stores only a project/draft reference, one current human action, blockers, and locked output IDs.

Detailed action packs, production stages, artifacts, generation jobs, editor synchronization, verification, and handoff stay behind the adapter seam. VectCut creates an editable draft from locked timeline clips and SRT, then stops for the same human-review gate; it never claims to have exported a final video.

For article production it owns a lightweight Article Assembler. One branch binds one versioned local platform profile and one parent master revision. The assembler maintains an ordered content-block document and derives only a local preview analogue and asset manifest for the MVP. Platform APIs, exact backend layout, draft synchronization, upload, and publishing are deferred.

After production locks, the release packager derives three titles, two evidence-safe cover candidates, and one carrier-specific release text. Video uses an introduction; article uses a summary and derives one final preview analogue. No cover-specific public tool is added.
