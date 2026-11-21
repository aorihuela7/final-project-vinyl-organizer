-- v2 · Hardening.
--
-- 1. Discogs data isn't kept longer than necessary: records of accounts that
--    haven't synced (opened the app) in 90 days are deleted every night by
--    pg_cron; placements go with them. Shelves and settings stay, and the next
--    visit re-imports the collection and lays it out again.
-- 2. Deleting a Clerk account deletes its rows: a Clerk webhook calls
--    public.delete_user_data(user_id, secret). The secret's SHA-256 lives in
--    private.settings (not exposed by the Data API), set once by Ale; without
--    it, the function refuses.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.settings (
  name text primary key,
  value_hash text not null
);
revoke all on table private.settings from public, anon, authenticated;

-- ---------------------------------------------------------------- 1. purge
create function private.purge_inactive_discogs_data(p_days int default 90)
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
    where c.last_synced_at is not null and c.last_synced_at < now() - make_interval(days => p_days)
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
revoke execute on function private.purge_inactive_discogs_data(int) from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('purge-inactive-discogs-data', '17 4 * * *', 'select private.purge_inactive_discogs_data(90)');

-- ------------------------------------------------------- 2. account deletion
create function public.delete_user_data(p_user_id text, p_secret text)
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
  delete from public.artist_tags where user_id = p_user_id;
  delete from public.tags where user_id = p_user_id;
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
revoke execute on function public.delete_user_data(text, text) from public;
grant execute on function public.delete_user_data(text, text) to anon, authenticated;
