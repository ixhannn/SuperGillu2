# Supabase Security

Apply [20260331_secure_rls.sql](/C:/Users/Sameer/Downloads/lior/supabase/migrations/20260331_secure_rls.sql) to the Lior Supabase project before relying on cloud security.

What it does:
- Enables and forces RLS on all app data tables
- Restricts rows to the authenticated Supabase account via `user_id = auth.uid()`
- Adds `claim_lior_legacy_rows()` so existing unscoped rows can be adopted by the logged-in account
- Locks the `lior-media` storage bucket to user-scoped paths like `auth.uid()/mem/...`

Current security model:
- Lior is secured as a shared-account app
- Both devices for the couple should sign into the same Supabase auth account
- If you want separate accounts per partner later, the next step is a real `couples` / `memberships` schema and couple-scoped policies
