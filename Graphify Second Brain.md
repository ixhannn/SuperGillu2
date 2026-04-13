# Graphify Second Brain

This vault has a Graphify-powered code context layer for the app source, not the full repository dump.

## Start Here

- [[graphify-out/wiki/index]] for the wiki-style map of major code communities
- [[graphify-out/GRAPH_REPORT]] for god nodes, surprising connections, and suggested questions
- [[graphify-out/obsidian/graph.canvas]] for spatial navigation inside Obsidian
- The `_COMMUNITY_*` notes inside `graphify-out/obsidian/` for cluster overviews

## Refresh

```bash
npm run brain:build
```

For continuous refresh while you work:

```bash
npm run brain:watch
```

## Scope

The second brain is intentionally scoped by [graphify.second-brain.json](C:/Users/Sameer/Downloads/tulika/graphify.second-brain.json) so it stays focused on the real app code:

- `App.tsx`, `index.tsx`, `types.ts`
- `components/`, `hooks/`, `services/`, `utils/`, `views/`, `workers/`
- `supabase/functions/`
- `android/app/src/main/java/`

Edit `graphify.second-brain.json` if you want to widen or narrow the context map.
