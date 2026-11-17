-- apply_placements can also remove placements (a record pushed off the end of
-- the shelf by an insertion cascade no longer fits anywhere).
drop function public.apply_placements(jsonb, jsonb);

create function public.apply_placements(p_placements jsonb, p_event jsonb, p_remove uuid[] default '{}')
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user text := (select auth.jwt()->>'sub');
  v_count int;
  v_removed int;
  v_event uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  delete from public.placements where user_id = v_user and record_id = any (coalesce(p_remove, '{}'));
  get diagnostics v_removed = row_count;

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

  return jsonb_build_object('placed', v_count, 'removed', v_removed, 'event_id', v_event);
end
$$;

revoke execute on function public.apply_placements(jsonb, jsonb, uuid[]) from public;
grant execute on function public.apply_placements(jsonb, jsonb, uuid[]) to authenticated;
