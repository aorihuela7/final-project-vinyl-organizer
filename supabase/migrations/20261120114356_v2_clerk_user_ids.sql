-- v2 · Only Clerk accounts can own rows.
--
-- Supabase Auth's own email sign-up is still enabled on the project (turning it
-- off is a dashboard setting, on Ale's list). Anyone could get an
-- `authenticated` token from it, with a uuid as `sub`, skipping Clerk (its bot
-- protection, its deletion webhook). Clerk user ids look like `user_2abc…`, so
-- requiring that shape on every user_id means such a token can't write anything.
-- Every existing row already matches (checked before this migration).
do $$
declare
  t text;
begin
  foreach t in array array[
    'collections', 'records', 'import_jobs', 'furniture', 'compartments', 'shelf_settings', 'placements',
    'layout_events', 'user_preferences', 'temporary_locations', 'tags', 'artist_tags', 'share_links'
  ] loop
    execute format(
      'alter table public.%I add constraint %I check (user_id ~ ''^user_[A-Za-z0-9]+$'')',
      t, t || '_clerk_user_id_check'
    );
  end loop;
end
$$;
