-- v2 · Guest mode: a read-only link to the shelf, so a guest at a party can
-- find a record and see where to put it back without an account.
--
-- The owner creates a link (a random 128-bit token) and can turn it off.
-- Guests never touch the tables: they call shared_shelf(token), a SECURITY
-- DEFINER function that returns only the shelf behind an active token, and
-- only the fields the read-only view needs. No token, a wrong one, or a
-- revoked one returns null. The Discogs 6-hour rule is enforced by the guest
-- page, which only shows data synced in the last 6 hours (last_synced_at).

create table public.share_links (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{20,64}$'),
  user_id text not null default (auth.jwt()->>'sub'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index share_links_user_idx on public.share_links (user_id);

alter table public.share_links enable row level security;
revoke all on table public.share_links from anon, authenticated;
grant select, insert, update, delete on table public.share_links to authenticated;

create policy share_links_select_own on public.share_links
  for select to authenticated using ((select auth.jwt()->>'sub') = user_id);
create policy share_links_insert_own on public.share_links
  for insert to authenticated with check ((select auth.jwt()->>'sub') = user_id);
create policy share_links_update_own on public.share_links
  for update to authenticated using ((select auth.jwt()->>'sub') = user_id) with check ((select auth.jwt()->>'sub') = user_id);
create policy share_links_delete_own on public.share_links
  for delete to authenticated using ((select auth.jwt()->>'sub') = user_id);

create function public.shared_shelf(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,64}$' then
    return null;
  end if;
  select l.user_id into v_user from public.share_links l where l.token = p_token and l.revoked_at is null;
  if v_user is null then
    return null;
  end if;

  return jsonb_build_object(
    'last_synced_at', (select c.last_synced_at from public.collections c where c.user_id = v_user),
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

revoke execute on function public.shared_shelf(text) from public;
grant execute on function public.shared_shelf(text) to anon, authenticated;
