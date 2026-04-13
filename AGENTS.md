## graphify

This project has a local Graphify second brain in `graphify-out/`.

Rules:
- For architecture questions, onboarding, dependency tracing, feature ownership, or cross-file context, start with `graphify-out/GRAPH_REPORT.md` before reading raw source files.
- Use `graphify-out/wiki/index.md` as the first navigation layer when the task is exploratory or spans multiple areas.
- Use `graphify-out/obsidian/graph.canvas` or the notes in `graphify-out/obsidian/` when spatial or cluster-based context is useful.
- Treat the graph as a fast structural map, then confirm exact behavior in source files before making edits.
- The second brain is intentionally scoped to app code from `graphify.second-brain.json`; it does not represent the entire repository.
- If `graphify-out/` is missing or stale after code changes, refresh it with `npm run brain:build`.
- If the user is actively iterating on structure-heavy code, prefer `npm run brain:watch` in a separate terminal so context stays current.
