-- v2 · Custom sections and tags.
--
-- Tags are user-defined ("Sunday morning", "house", "120–125 bpm"), in the
-- user's own order, and assigned per artist (artist_key is the artist's
-- identity: no Discogs "(2)" suffix, no leading article, case and accents
-- folded), so nobody tags record by record. "tag" becomes a sort level.
--
-- A section pins a genre or a tag to a shelf (furniture.section =
-- "genre:Jazz" or "tag:Sunday morning"): matching records go only on shelves
-- of that section, sorted inside it. Additive; the deployed v1 ignores both.

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt()->>'sub'),
  name text not null check (char_length(name) between 1 and 40),
  sort_index int not null default 0,
  created_at timestamptz not null default now(),
  constraint tags_id_user unique (id, user_id),
  constraint tags_name_per_user unique (user_id, name)
);

create table public.artist_tags (
  user_id text not null default (auth.jwt()->>'sub'),
  artist_key text not null check (char_length(artist_key) between 1 and 300),
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_key),
  constraint artist_tags_tag_fk foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);

do $$
declare
  t text;
begin
  foreach t in array array['tags', 'artist_tags']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.jwt()->>''sub'') = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.jwt()->>''sub'') = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.jwt()->>''sub'') = user_id) with check ((select auth.jwt()->>''sub'') = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.jwt()->>''sub'') = user_id)', t || '_delete_own', t);
  end loop;
end
$$;

alter table public.furniture
  add column section text check (section is null or section ~ '^(genre|tag):.{1,100}$');

-- "tag" joins the sort levels.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.shelf_settings'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%sort_levels%'
  loop
    execute format('alter table public.shelf_settings drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.shelf_settings
  add constraint shelf_settings_sort_levels_check check (
    cardinality(sort_levels) between 1 and 3
    and sort_levels <@ array['genre', 'tag', 'artist', 'year', 'label', 'title']
  );

-- save_setup also saves each shelf's section.
create or replace function public.save_setup(
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
    insert into public.furniture (name, template, media, rows, cols, traversal, default_capacity, sort_index, section)
    values (
      v_f->>'name',
      v_f->>'template',
      coalesce(v_f->>'media', 'vinyl'),
      (v_f->>'rows')::int,
      (v_f->>'cols')::int,
      coalesce(v_f->>'traversal', 'rows'),
      (v_f->>'default_capacity')::int,
      (v_f->>'sort_index')::int,
      nullif(v_f->>'section', '')
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
    insert into public.shelf_settings (sort_levels, ignore_articles, slack_pct, thickness_by_format, updated_at)
    values (
      array(select jsonb_array_elements_text(p_settings->'sort_levels')),
      (p_settings->>'ignore_articles')::boolean,
      (p_settings->>'slack_pct')::numeric,
      coalesce((p_settings->>'thickness_by_format')::boolean, false),
      now()
    )
    on conflict (user_id) do update set
      sort_levels = excluded.sort_levels,
      ignore_articles = excluded.ignore_articles,
      slack_pct = excluded.slack_pct,
      thickness_by_format = excluded.thickness_by_format,
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

