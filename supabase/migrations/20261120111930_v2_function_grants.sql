-- v2 · Security pass: functions callable without a session only when they're meant to be.
--
-- Supabase grants EXECUTE on new public functions to anon by default, and the
-- v1 migrations only revoked it from PUBLIC. save_setup and apply_placements
-- already refuse without a session (and run with RLS), but anon shouldn't be
-- able to call them at all. Kept for anon on purpose: keepalive (the daily
-- cron), shared_shelf (guest links, token-checked), delete_user_data (the
-- Clerk webhook, secret-checked).

revoke execute on function public.save_setup(jsonb, jsonb, jsonb, jsonb) from anon;
revoke execute on function public.apply_placements(jsonb, jsonb, uuid[]) from anon;
revoke execute on function public.records_fill_format_group() from anon, authenticated, public;
revoke execute on function public.classify_record_format(text, text[]) from anon;
revoke execute on function public.classify_vinyl_size(text[]) from anon;
