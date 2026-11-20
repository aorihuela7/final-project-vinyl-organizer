-- v2 · Fix for v2_security_review: in prune_layout_events, the subquery alias
-- "old" clashed with PL/pgSQL's OLD record, so every insert into layout_events
-- failed ("column reference old.id is ambiguous"). Same function, the alias renamed.
create or replace function public.prune_layout_events()
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
  ) expired
  where e.id = expired.id;
  return null;
end
$$;
