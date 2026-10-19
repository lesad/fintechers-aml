-- RLS for the public guestbook. NOTE: the app reads/writes via Drizzle over the
-- direct Postgres (table-owner) connection, which BYPASSES RLS — so these policies
-- are defense-in-depth for the anon-key / PostgREST path (e.g. a future supabase-js
-- client), not a gate on the Drizzle path. Every tenant-scoped table gets an RLS
-- companion (CLAUDE.md hard rule); demonstrated here even though guestbook is public.
alter table "guestbook" enable row level security;

create policy "guestbook_public_select"
  on "guestbook" for select
  to anon, authenticated
  using (true);

create policy "guestbook_anon_insert"
  on "guestbook" for insert
  to anon, authenticated
  with check (true);
