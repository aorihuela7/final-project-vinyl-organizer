-- v2 · Format groups: LPs (12" and 10") and singles (7") on separate shelves.
--
-- Additive on purpose: the deployed v1 reads and writes this same database, so
-- nothing it relies on is renamed. In furniture.media, 'vinyl' keeps meaning
-- "LPs (12" and 10")" (renaming it to 'lp' is a later migration, after v2 is
-- deployed) and 'single' is new.
--
-- Records get size_inches and format_group, computed from their formats with
-- Ale's rules (the TypeScript version is src/lib/discogs/format.ts):
--   1. an explicit size wins: 7" -> single; 10" or 12" -> LP;
--   2. with no size, the exact description Single or EP -> single (7");
--   3. everything else on vinyl -> LP (12");
--   4. with several formats, the largest size wins (the v2 import applies this
--      one, since only one format's descriptions are stored).
-- Odd sizes go to the nearest shelf: up to 8" -> 7, 9" to 11" -> 10, bigger -> 12.

-- ------------------------------------------------------------ classification
create function public.classify_vinyl_size(p_descriptions text[])
returns smallint
language sql
immutable
set search_path = ''
as $$
  with largest as (
    select max((regexp_match(d, '^\s*(\d+(?:\.\d+)?)\s*(?:"|″|''''|inch|in)\s*$', 'i'))[1]::numeric) as inches
    from unnest(coalesce(p_descriptions, '{}'::text[])) as d
  )
  select (
    case
      when largest.inches is not null then
        case when largest.inches <= 8 then 7 when largest.inches < 11.5 then 10 else 12 end
      when 'Single' = any (coalesce(p_descriptions, '{}'::text[])) or 'EP' = any (coalesce(p_descriptions, '{}'::text[])) then 7
      else 12
    end
  )::smallint
  from largest
$$;

create function public.classify_record_format(p_media text, p_descriptions text[], out size_inches smallint, out format_group text)
language sql
immutable
set search_path = ''
as $$
  select
    case when p_media = 'vinyl' then public.classify_vinyl_size(p_descriptions) end,
    case
      when p_media = 'cd' then 'cd'
      when p_media = 'vinyl' then case when public.classify_vinyl_size(p_descriptions) = 7 then 'single' else 'lp' end
      else 'other'
    end
$$;

-- ------------------------------------------------------------------ records
alter table public.records
  add column size_inches smallint check (size_inches is null or size_inches in (7, 10, 12)),
  add column format_group text check (format_group is null or format_group in ('lp', 'single', 'cd', 'other'));

-- Rows written without a group (by the deployed v1, or by hand) get one from
-- their stored formats. The v2 import sends both columns, computed from every
-- format, and those win.
create function public.records_fill_format_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.format_group is null then
    select c.size_inches, c.format_group
    into new.size_inches, new.format_group
    from public.classify_record_format(new.media, new.format_descriptions) as c;
  end if;
  return new;
end
$$;

create trigger records_fill_format_group
  before insert or update on public.records
  for each row execute function public.records_fill_format_group();

-- Backfill every existing record from its stored format data.
update public.records as r
set (size_inches, format_group) = (
  select c.size_inches, c.format_group
  from public.classify_record_format(r.media, r.format_descriptions) as c
)
where r.format_group is null;

-- --------------------------------------------- furniture and layout_events checks
-- The inline checks were named by Postgres; find them by definition.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.furniture'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) like '%media%' or pg_get_constraintdef(oid) like '%template%')
  loop
    execute format('alter table public.furniture drop constraint %I', c.conname);
  end loop;
  for c in
    select conname from pg_constraint
    where conrelid = 'public.layout_events'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table public.layout_events drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.furniture
  add constraint furniture_media_check check (media in ('vinyl', 'single', 'cd')),
  add constraint furniture_template_check
    check (template in ('kallax_4x4', 'kallax_5x5', 'low_2x4', 'tower_1x5', 'crates', 'record_box', 'custom'));

alter table public.layout_events
  add constraint layout_events_kind_check check (kind in ('initial', 'insert', 'calibrate', 'relayout', 'format_split'));

-- ------------------------------------- singles leave the LP shelves, LPs stay put
-- Only the placements of singles on LP ('vinyl') shelves are removed. No LP
-- moves: taking records out of a sorted run keeps every compartment's range
-- continuous, and no compartment gets fuller. Each user gets one layout event
-- listing the singles that came off the map.
with removed as (
  delete from public.placements as p
  using public.records as r, public.compartments as c, public.furniture as f
  where r.id = p.record_id
    and c.id = p.compartment_id
    and f.id = c.furniture_id
    and r.format_group = 'single'
    and f.media = 'vinyl'
  returning p.user_id, p.record_id, p.compartment_id
)
insert into public.layout_events (user_id, kind, moves, moved_count)
select
  user_id,
  'format_split',
  jsonb_agg(jsonb_build_object('recordId', record_id, 'from', compartment_id, 'to', null)),
  count(*)
from removed
group by user_id;
