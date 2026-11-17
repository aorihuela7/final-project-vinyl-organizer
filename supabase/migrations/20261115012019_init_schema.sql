-- Record Organizer · initial schema
--
-- Every table carries user_id = the Clerk user ID (text, like "user_2abc…"),
-- taken from the Clerk session token through Supabase third-party auth.
-- RLS compares it with auth.jwt()->>'sub'. Never auth.uid(): it casts to uuid
-- and fails with Clerk IDs.
--
-- Grants are explicit (Supabase recommends bundling grants with RLS in the
-- same migration): anon gets nothing on tables; authenticated gets CRUD, and
-- RLS limits it to the caller's own rows.
--
-- Composite foreign keys (id, user_id) make sure a row can only point to rows
-- of the same user, even though foreign-key checks bypass RLS.

-- ---------------------------------------------------------------- collections
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt()->>'sub'),
  source text not null check (source in ('discogs', 'demo', 'manual')),
  discogs_username text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  constraint collections_one_per_user unique (user_id),
  constraint collections_id_user unique (id, user_id)
);

-- -------------------------------------------------------------------- records
create table public.records (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt()->>'sub'),
  discogs_release_id bigint,
  -- Two copies of the same release are two rows. Null for records added by hand
  -- through "Where does this record go?" (they aren't in the Discogs collection).
  discogs_instance_id bigint,
  artist text not null,
  title text not null,
  year int,
  label text,
  genre text,
  styles text[] not null default '{}',
  format_name text,
  format_qty int,
  format_descriptions text[] not null default '{}',
  -- Which kind of shelf the record goes on, derived from its formats at import.
  media text not null default 'vinyl' check (media in ('vinyl', 'cd', 'other')),
  cover_url text,
  thumb_url text,
  discogs_url text,
  date_added timestamptz,
  synced_at timestamptz not null default now(),
  last_seen_job_id uuid,
  origin text not null default 'import' check (origin in ('import', 'added')),
  created_at timestamptz not null default now(),
  constraint records_instance_per_user unique (user_id, discogs_instance_id),
  constraint records_id_user unique (id, user_id)
);
create index records_user_idx on public.records (user_id);

-- ---------------------------------------------------------------- import_jobs
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt()->>'sub'),
  collection_id uuid not null,
  source text not null check (source in ('discogs', 'demo')),
  discogs_username text not null,
  -- The demo reads only the first max_pages pages (newest first).
  max_pages int check (max_pages is null or max_pages > 0),
  sort text not null default 'added',
  sort_order text not null default 'asc' check (sort_order in ('asc', 'desc')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  next_page int not null default 1 check (next_page > 0),
  total_pages int,
  items_total int,
  items_done int not null default 0,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint import_jobs_collection_fk foreign key (collection_id, user_id)
    references public.collections (id, user_id) on delete cascade
);
create index import_jobs_user_idx on public.import_jobs (user_id, created_at desc);
-- Only one active job per user.
create unique index import_jobs_one_active_per_user
  on public.import_jobs (user_id) where status in ('queued', 'running');

-- ------------------------------------------------------------------ furniture
create table public.furniture (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt()->>'sub'),
  name text not null check (char_length(name) between 1 and 60),
  template text not null check (template in ('kallax_4x4', 'kallax_5x5', 'low_2x4', 'tower_1x5', 'crates', 'custom')),
  media text not null default 'vinyl' check (media in ('vinyl', 'cd')),
  rows int not null check (rows between 1 and 12),
  cols int not null check (cols between 1 and 24),
  traversal text not null default 'rows' check (traversal in ('rows', 'columns')),
  default_capacity int not null check (default_capacity between 1 and 1000),
  sort_index int not null,
  created_at timestamptz not null default now(),
  constraint furniture_id_user unique (id, user_id),
  constraint furniture_sort_index_per_user unique (user_id, sort_index)
);

-- --------------------------------------------------------------- compartments
create table public.compartments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt()->>'sub'),
  furniture_id uuid not null,
  "row" int not null check ("row" >= 0),
  col int not null check (col >= 0),
  status text not null default 'available' check (status in ('available', 'blocked')),
  -- Optional override of the shelf's default capacity.
  capacity int check (capacity is null or capacity between 1 and 1000),
  constraint compartments_position unique (furniture_id, "row", col),
  constraint compartments_id_user unique (id, user_id),
  constraint compartments_furniture_fk foreign key (furniture_id, user_id)
    references public.furniture (id, user_id) on delete cascade
);
create index compartments_user_idx on public.compartments (user_id);

-- ------------------------------------------------------------- shelf_settings
create table public.shelf_settings (
  user_id text primary key default (auth.jwt()->>'sub'),
  sort_levels text[] not null default '{artist}'
    check (
      cardinality(sort_levels) between 1 and 3
      and sort_levels <@ array['genre', 'artist', 'year', 'label', 'title']
    ),
  ignore_articles boolean not null default true,
  slack_pct numeric(4, 1) not null default 10 check (slack_pct >= 0 and slack_pct <= 90),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- placements
-- The physical state of the shelf: stored, not recomputed on every view.
-- Order within a compartment comes from the sort key.
create table public.placements (
  record_id uuid primary key,
  user_id text not null default (auth.jwt()->>'sub'),
  compartment_id uuid not null,
  placed_at timestamptz not null default now(),
  constraint placements_record_fk foreign key (record_id, user_id)
    references public.records (id, user_id) on delete cascade,
  constraint placements_compartment_fk foreign key (compartment_id, user_id)
    references public.compartments (id, user_id) on delete cascade
);
create index placements_user_idx on public.placements (user_id);
create index placements_compartment_idx on public.placements (compartment_id);

-- -------------------------------------------------------------- layout_events
-- Every change to the map, with its moves: the baseline the v2 simulator compares against.
create table public.layout_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt()->>'sub'),
  kind text not null check (kind in ('initial', 'insert', 'calibrate', 'relayout')),
  moves jsonb not null default '[]',
  moved_count int not null default 0,
  created_at timestamptz not null default now()
);
create index layout_events_user_idx on public.layout_events (user_id, created_at desc);

-- ------------------------------------------------------- RLS, policies, grants
do $$
declare
  t text;
begin
  foreach t in array array[
    'collections', 'records', 'import_jobs', 'furniture',
    'compartments', 'shelf_settings', 'placements', 'layout_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.jwt()->>''sub'') = user_id)',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.jwt()->>''sub'') = user_id)',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.jwt()->>''sub'') = user_id) with check ((select auth.jwt()->>''sub'') = user_id)',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.jwt()->>''sub'') = user_id)',
      t || '_delete_own', t);
  end loop;
end
$$;

-- ------------------------------------------------------------------ functions
-- All functions are SECURITY INVOKER, so RLS applies to every statement inside.

-- Minimal query for the daily keepalive cron, callable without a session.
create function public.keepalive()
returns int
language sql
stable
security invoker
set search_path = ''
as $$ select 1 $$;

-- Replaces the whole setup in one transaction: shelves, compartments, sort
-- settings, and placements, plus the layout event. Placements are given by
-- position (shelf sort_index, row, col) because compartments get new ids.
create function public.save_setup(
  p_furniture jsonb,
  p_settings jsonb,
  p_placements jsonb,
  p_event jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user text := (select auth.jwt()->>'sub');
  v_f jsonb;
  v_fid uuid;
  v_placed int;
  v_event uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  delete from public.furniture where user_id = v_user;

  for v_f in select value from jsonb_array_elements(p_furniture)
  loop
    insert into public.furniture (name, template, media, rows, cols, traversal, default_capacity, sort_index)
    values (
      v_f->>'name',
      v_f->>'template',
      coalesce(v_f->>'media', 'vinyl'),
      (v_f->>'rows')::int,
      (v_f->>'cols')::int,
      coalesce(v_f->>'traversal', 'rows'),
      (v_f->>'default_capacity')::int,
      (v_f->>'sort_index')::int
    )
    returning id into v_fid;

    insert into public.compartments (furniture_id, "row", col, status, capacity)
    select
      v_fid,
      (c->>'row')::int,
      (c->>'col')::int,
      coalesce(c->>'status', 'available'),
      nullif(c->>'capacity', '')::int
    from jsonb_array_elements(v_f->'compartments') as c;
  end loop;

  if p_settings is not null then
    insert into public.shelf_settings (sort_levels, ignore_articles, slack_pct, updated_at)
    values (
      array(select jsonb_array_elements_text(p_settings->'sort_levels')),
      (p_settings->>'ignore_articles')::boolean,
      (p_settings->>'slack_pct')::numeric,
      now()
    )
    on conflict (user_id) do update set
      sort_levels = excluded.sort_levels,
      ignore_articles = excluded.ignore_articles,
      slack_pct = excluded.slack_pct,
      updated_at = now();
  end if;

  insert into public.placements (record_id, compartment_id)
  select (p->>'record_id')::uuid, c.id
  from jsonb_array_elements(coalesce(p_placements, '[]'::jsonb)) as p
  join public.furniture f on f.user_id = v_user and f.sort_index = (p->>'sort_index')::int
  join public.compartments c on c.furniture_id = f.id and c."row" = (p->>'row')::int and c.col = (p->>'col')::int;
  get diagnostics v_placed = row_count;

  if p_event is not null then
    insert into public.layout_events (kind, moves, moved_count)
    values (p_event->>'kind', coalesce(p_event->'moves', '[]'::jsonb), coalesce((p_event->>'moved_count')::int, 0))
    returning id into v_event;
  end if;

  return jsonb_build_object('placed', v_placed, 'event_id', v_event);
end
$$;

-- Upserts some placements (insertion, calibration, new records after a
-- re-sync) and records the layout event, in one transaction.
create function public.apply_placements(p_placements jsonb, p_event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user text := (select auth.jwt()->>'sub');
  v_count int;
  v_event uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  insert into public.placements (record_id, compartment_id)
  select (p->>'record_id')::uuid, (p->>'compartment_id')::uuid
  from jsonb_array_elements(coalesce(p_placements, '[]'::jsonb)) as p
  on conflict (record_id) do update set compartment_id = excluded.compartment_id, placed_at = now();
  get diagnostics v_count = row_count;

  if p_event is not null then
    insert into public.layout_events (kind, moves, moved_count)
    values (p_event->>'kind', coalesce(p_event->'moves', '[]'::jsonb), coalesce((p_event->>'moved_count')::int, 0))
    returning id into v_event;
  end if;

  return jsonb_build_object('placed', v_count, 'event_id', v_event);
end
$$;

revoke execute on function public.keepalive() from public;
revoke execute on function public.save_setup(jsonb, jsonb, jsonb, jsonb) from public;
revoke execute on function public.apply_placements(jsonb, jsonb) from public;
grant execute on function public.keepalive() to anon, authenticated;
grant execute on function public.save_setup(jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.apply_placements(jsonb, jsonb) to authenticated;
