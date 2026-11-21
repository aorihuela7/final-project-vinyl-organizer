-- v2 · Thickness by format: an optional setting that counts double albums and
-- box sets by their number of discs, so a compartment's capacity is measured in
-- places, not records. Off by default (v1 behavior). save_setup learns to save
-- it; the deployed v1 doesn't send it, so it stays off for v1 saves.

alter table public.shelf_settings
  add column thickness_by_format boolean not null default false;

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

