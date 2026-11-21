-- v2 · Per-user preferences: the language and the guided tour's state.
-- A separate table because shelf_settings only exists once shelves are saved,
-- and the tour has to remember "show me around when my shelf is ready" before that.

create table public.user_preferences (
  user_id text primary key default (auth.jwt()->>'sub'),
  locale text not null default 'en' check (locale in ('en', 'es', 'pt')),
  tour_status text check (tour_status is null or tour_status in ('offered', 'accepted_pending', 'completed', 'dismissed')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
revoke all on table public.user_preferences from anon, authenticated;
grant select, insert, update, delete on table public.user_preferences to authenticated;

create policy user_preferences_select_own on public.user_preferences
  for select to authenticated using ((select auth.jwt()->>'sub') = user_id);
create policy user_preferences_insert_own on public.user_preferences
  for insert to authenticated with check ((select auth.jwt()->>'sub') = user_id);
create policy user_preferences_update_own on public.user_preferences
  for update to authenticated using ((select auth.jwt()->>'sub') = user_id) with check ((select auth.jwt()->>'sub') = user_id);
create policy user_preferences_delete_own on public.user_preferences
  for delete to authenticated using ((select auth.jwt()->>'sub') = user_id);
