-- v2 · Tags are removed (Ale's review, November 20, 2026): the tag sort level,
-- tag sections, and the tags and artist_tags tables. Checked before writing
-- it: no tags, no artist tags, no shelf section and no sort order used them,
-- so nothing is lost. The deployed v1 never used tags. Sections by genre stay.

-- ------------------------------------------------------------ sort levels
-- An order that used tags keeps its other levels (or artist, if none is left).
update public.shelf_settings
set sort_levels = coalesce(nullif(array_remove(sort_levels, 'tag'), '{}'::text[]), array['artist'])
where 'tag' = any(sort_levels);

alter table public.shelf_settings drop constraint shelf_settings_sort_levels_check;
alter table public.shelf_settings
  add constraint shelf_settings_sort_levels_check check (
    cardinality(sort_levels) between 1 and 3
    and sort_levels <@ array['genre', 'artist', 'year', 'label', 'title']
  );

-- --------------------------------------------------------------- sections
-- A shelf pinned to a tag takes everything else again.
update public.furniture set section = null where section like 'tag:%';

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.furniture'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%section%'
  loop
    execute format('alter table public.furniture drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.furniture
  add constraint furniture_section_check check (section is null or section ~ '^genre:.{1,100}$');

-- ------------------------------------------------------------- guest links
-- Same as in v2_security_review, without tags and artist tags. Grants are kept by create or replace.
create or replace function public.shared_shelf(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text;
  v_synced timestamptz;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,64}$' then
    return null;
  end if;
  select l.user_id into v_user from public.share_links l where l.token = p_token and l.revoked_at is null;
  if v_user is null then
    return null;
  end if;

  select c.last_synced_at into v_synced from public.collections c where c.user_id = v_user;
  if v_synced is null or v_synced < now() - interval '6 hours' then
    return jsonb_build_object('stale', true, 'last_synced_at', v_synced);
  end if;

  return jsonb_build_object(
    'stale', false,
    'last_synced_at', v_synced,
    'settings', (
      select jsonb_build_object('sort_levels', s.sort_levels, 'ignore_articles', s.ignore_articles, 'slack_pct', s.slack_pct, 'thickness_by_format', s.thickness_by_format)
      from public.shelf_settings s where s.user_id = v_user
    ),
    'furniture', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'template', f.template, 'media', f.media, 'rows', f.rows, 'cols', f.cols,
        'traversal', f.traversal, 'default_capacity', f.default_capacity, 'sort_index', f.sort_index, 'section', f.section,
        'compartments', coalesce((
          select jsonb_agg(jsonb_build_object('id', c.id, 'row', c."row", 'col', c.col, 'status', c.status, 'capacity', c.capacity))
          from public.compartments c where c.furniture_id = f.id
        ), '[]'::jsonb)
      ) order by f.sort_index)
      from public.furniture f where f.user_id = v_user
    ), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_array(p.record_id, p.compartment_id)) from public.placements p where p.user_id = v_user
    ), '[]'::jsonb),
    'records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'discogs_release_id', r.discogs_release_id, 'artist', r.artist, 'title', r.title, 'year', r.year,
        'label', r.label, 'genre', r.genre, 'styles', r.styles, 'format_name', r.format_name, 'format_qty', r.format_qty,
        'format_descriptions', r.format_descriptions, 'media', r.media, 'size_inches', r.size_inches,
        'format_group', r.format_group, 'cover_url', r.cover_url, 'thumb_url', r.thumb_url, 'discogs_url', r.discogs_url,
        'temp_location_id', r.temp_location_id, 'origin', r.origin
      ))
      from public.records r where r.user_id = v_user
    ), '[]'::jsonb),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name)) from public.temporary_locations l where l.user_id = v_user
    ), '[]'::jsonb)
  );
end
$$;

-- --------------------------------------------------------- account deletion
-- Same as in v2_hardening, without the tag tables. Grants are kept by create or replace.
create or replace function public.delete_user_data(p_user_id text, p_secret text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_count int := 0;
  v_rows int;
begin
  select s.value_hash into v_hash from private.settings s where s.name = 'user_deletion';
  if v_hash is null or p_secret is null or encode(extensions.digest(p_secret, 'sha256'), 'hex') <> v_hash then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id !~ '^user_[A-Za-z0-9]+$' then
    raise exception 'Invalid user id' using errcode = '22023';
  end if;
  -- Children first where there's no cascade; the rest cascade from records, furniture, and collections.
  delete from public.share_links where user_id = p_user_id;
  delete from public.layout_events where user_id = p_user_id;
  delete from public.placements where user_id = p_user_id;
  delete from public.records where user_id = p_user_id;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;
  delete from public.temporary_locations where user_id = p_user_id;
  delete from public.furniture where user_id = p_user_id;
  delete from public.shelf_settings where user_id = p_user_id;
  delete from public.user_preferences where user_id = p_user_id;
  delete from public.import_jobs where user_id = p_user_id;
  delete from public.collections where user_id = p_user_id;
  return v_count;
end
$$;

-- ------------------------------------------------------------------ tables
-- Their policies, grants, quota triggers, and checks go with them.
drop table public.artist_tags;
drop table public.tags;
