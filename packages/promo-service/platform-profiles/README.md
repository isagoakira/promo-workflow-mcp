# Platform Profiles

Store small, local, versioned article-platform policy packs here.

Each profile must declare:

- a stable profile ID, platform name, and version;
- hard constraints and soft preferences;
- one `preview_analogue` render preset;
- source references and the time they were checked.

Profiles refresh only when needed. A refresh creates a new version and never rewrites an existing article branch. Do not add platform upload credentials, draft IDs, publishing logic, or exact backend-layout emulation to a profile.

Concrete platform rules are added only after their sources are verified. The shared shape lives in `@promo-workflow/contracts`.
