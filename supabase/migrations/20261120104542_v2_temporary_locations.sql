-- v2 · Temporary locations: places outside the sort order (next to the
-- turntable, the gig bag, the discards box, on display, an unsorted pile).
-- A record taken out keeps its placement, which is its home spot; "Put it
-- back" clears the temporary location. Additive: the deployed v1 ignores it.

create table public.temporary_locations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt()->>'sub'),
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  constraint temporary_locations_id_user unique (id, user_id),
  constraint temporary_locations_name_per_user unique (user_id, name)
);

alter table public.records
  add column temp_location_id uuid,
  add column taken_out_at timestamptz,
  -- Same user only (composite key); deleting a location puts its records back on the shelf.
  add constraint records_temp_location_fk foreign key (temp_location_id, user_id)
    references public.temporary_locations (id, user_id) on delete set null (temp_location_id);

create index records_temp_location_idx on public.records (temp_location_id) where temp_location_id is not null;

alter table public.temporary_locations enable row level security;
revoke all on table public.temporary_locations from anon, authenticated;
grant select, insert, update, delete on table public.temporary_locations to authenticated;

create policy temporary_locations_select_own on public.temporary_locations
  for select to authenticated using ((select auth.jwt()->>'sub') = user_id);
create policy temporary_locations_insert_own on public.temporary_locations
  for insert to authenticated with check ((select auth.jwt()->>'sub') = user_id);
create policy temporary_locations_update_own on public.temporary_locations
  for update to authenticated using ((select auth.jwt()->>'sub') = user_id) with check ((select auth.jwt()->>'sub') = user_id);
create policy temporary_locations_delete_own on public.temporary_locations
  for delete to authenticated using ((select auth.jwt()->>'sub') = user_id);
