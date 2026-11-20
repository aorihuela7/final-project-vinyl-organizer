-- v2 · Fixes from the independent security review (docs/security-pass.md §4).
--
-- 1. No account can fill the free database (500 MB; the project turns
--    read-only for everyone when it's full): size limits on what a row can
--    hold, row quotas per account, and a bounded layout log.
-- 2. Import jobs are checked by the database too: users can write their own
--    job rows through the Data API, which skips the API route's checks.
-- 3. Guest links stop returning Discogs data older than 6 hours (the rule was
--    only checked by the guest page).
-- 4. The nightly purge also covers imports that never finished.
-- 5. Pure helper functions are no longer callable by anon through PUBLIC.
--
-- Every new function is revoked from public, anon, and authenticated: they
-- run only as triggers (EXECUTE is checked when a trigger is created, not
-- when it fires).

-- ------------------------------------------------------- 1. size limits
alter table public.layout_events
  add constraint layout_events_moves_size_check
    check (jsonb_typeof(moves) = 'array' and pg_column_size(moves) <= 1048576);

alter table public.records
  add constraint records_array_text_check
    check (
      char_length(array_to_string(styles, '')) <= 2000
      and char_length(array_to_string(format_descriptions, '')) <= 2000
    );

-- Shelves are at most 12 rows by 24 columns (furniture checks).
alter table public.compartments
  add constraint compartments_position_bounds_check check ("row" < 12 and col < 24);

-- ------------------------------------------------------- 1. row quotas
-- After each insert statement, every account that got new rows must still be
-- under the table's limit (the trigger's argument). Runs as the caller, so
-- under RLS it counts only the caller's own rows.
create function public.enforce_row_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_limit bigint := TG_ARGV[0]::bigint;
  v_user text;
  v_count bigint;
begin
  for v_user in select distinct n.user_id from new_rows n loop
    execute format('select count(*) from %I.%I where user_id = $1', TG_TABLE_SCHEMA, TG_TABLE_NAME) into v_count using v_user;
    if v_count > v_limit then
      raise exception 'An account can have at most % rows in %', v_limit, TG_TABLE_NAME using errcode = '23514';
    end if;
  end loop;
  return null;
end
$$;
revoke execute on function public.enforce_row_quota() from public, anon, authenticated;

create trigger records_quota after insert on public.records
  referencing new table as new_rows for each statement execute function public.enforce_row_quota('25000');
create trigger artist_tags_quota after insert on public.artist_tags
  referencing new table as new_rows for each statement execute function public.enforce_row_quota('25000');
create trigger furniture_quota after insert on public.furniture
  referencing new table as new_rows for each statement execute function public.enforce_row_quota('30');
create trigger tags_quota after insert on public.tags
  referencing new table as new_rows for each statement execute function public.enforce_row_quota('100');
create trigger temporary_locations_quota after insert on public.temporary_locations
  referencing new table as new_rows for each statement execute function public.enforce_row_quota('100');
create trigger share_links_quota after insert on public.share_links
  referencing new table as new_rows for each statement execute function public.enforce_row_quota('20');

-- ------------------------------------------------- 1. bounded layout log
-- Each account keeps its newest 500 layout events, up to 5 MB of moves; older
-- ones are dropped. The newest calibration is always kept (the app uses it to
-- know you've calibrated).
create function public.prune_layout_events()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.layout_events e
  using (
    select ranked.id
    from (
      select
        le.id,
        le.kind,
        row_number() over newest as rn,
        sum(pg_column_size(le.moves)) over newest as bytes,
        row_number() over (partition by le.user_id, le.kind = 'calibrate' order by le.created_at desc, le.id desc) as kind_rn
      from public.layout_events le
      where le.user_id in (select distinct n.user_id from new_rows n)
      window newest as (partition by le.user_id order by le.created_at desc, le.id desc)
    ) ranked
    where (ranked.rn > 500 or ranked.bytes > 5242880)
      and not (ranked.kind = 'calibrate' and ranked.kind_rn = 1)
  ) old
  where e.id = old.id;
  return null;
end
$$;
revoke execute on function public.prune_layout_events() from public, anon, authenticated;

create trigger layout_events_prune after insert on public.layout_events
  referencing new table as new_rows for each statement execute function public.prune_layout_events();

-- ----------------------------------------------------- 2. import jobs
alter table public.import_jobs
  add constraint import_jobs_username_check
    check (discogs_username ~ '^[A-Za-z0-9._-]{1,64}$' and discogs_username !~ '^\.+$'),
  add constraint import_jobs_sort_check check (sort = 'added'),
  add constraint import_jobs_max_pages_bound_check check (max_pages is null or max_pages <= 10);

-- At most 30 imports started per account per hour (the start route allows 10 a minute
-- per server instance; this holds across instances and for direct inserts).
create function public.import_jobs_limit_starts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.import_jobs j where j.user_id = new.user_id and j.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many imports started in the last hour' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke execute on function public.import_jobs_limit_starts() from public, anon, authenticated;

create trigger import_jobs_limit_starts before insert on public.import_jobs
  for each row execute function public.import_jobs_limit_starts();

-- A job only moves forward: what it imports can't change, its page never goes
-- back, and a finished job stays finished (no endless re-imports of one job).
create function public.import_jobs_forward_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source <> old.source
    or new.discogs_username <> old.discogs_username
    or new.collection_id <> old.collection_id
    or new.sort <> old.sort
    or new.sort_order <> old.sort_order
    or new.max_pages is distinct from old.max_pages then
    raise exception 'An import job''s source can''t change' using errcode = '23514';
  end if;
  if new.next_page < old.next_page then
    raise exception 'An import job can''t go back a page' using errcode = '23514';
  end if;
  if old.status in ('done', 'error') and new.status <> old.status then
    raise exception 'A finished import job can''t be reopened' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke execute on function public.import_jobs_forward_only() from public, anon, authenticated;

create trigger import_jobs_forward_only before update on public.import_jobs
  for each row execute function public.import_jobs_forward_only();

-- ------------------------------------------- 3. guest links and 6 hours
-- Same function as in v2_guest_mode, plus the freshness rule: when the owner's
-- collection hasn't synced in the last 6 hours (or never), only {stale: true}
-- comes back, without any Discogs data. Grants are kept by create or replace.
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
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'sort_index', t.sort_index)) from public.tags t where t.user_id = v_user
    ), '[]'::jsonb),
    'artist_tags', coalesce((
      select jsonb_agg(jsonb_build_array(a.artist_key, a.tag_id)) from public.artist_tags a where a.user_id = v_user
    ), '[]'::jsonb)
  );
end
$$;

-- ----------------------------------------------- 4. purge, unfinished imports
-- Same as in v2_hardening, plus collections that never finished a sync (a first
-- import that failed or was abandoned) whose newest record is older than the limit.
create or replace function private.purge_inactive_discogs_data(p_days int default 90)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  with inactive as (
    select c.user_id from public.collections c
    where (c.last_synced_at is not null and c.last_synced_at < now() - make_interval(days => p_days))
       or (c.last_synced_at is null and not exists (
             select 1 from public.records r
             where r.user_id = c.user_id and r.synced_at >= now() - make_interval(days => p_days)
           ))
  ), removed as (
    delete from public.records r using inactive i where r.user_id = i.user_id returning r.id
  )
  select count(*) into v_deleted from removed;
  -- The collection stays (username, source); clearing the sync time makes the next visit re-import it.
  update public.collections c set last_synced_at = null
  where c.last_synced_at is not null and c.last_synced_at < now() - make_interval(days => p_days);
  return v_deleted;
end
$$;

-- ------------------------------------------------ 5. PUBLIC execute
-- New functions get EXECUTE for PUBLIC by default, so revoking only from anon
-- (as v2_function_grants did) left these callable by anon. Authenticated keeps
-- its own grant: the format group trigger calls them as the inserting user.
revoke execute on function public.classify_vinyl_size(text[]) from public, anon;
revoke execute on function public.classify_record_format(text, text[]) from public, anon;
grant execute on function public.classify_vinyl_size(text[]) to authenticated;
grant execute on function public.classify_record_format(text, text[]) to authenticated;
