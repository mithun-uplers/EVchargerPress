-- Optional hardening for the live-charging functions (run in the Supabase SQL Editor).
-- start_charging, stop_charging and live_session already refuse anonymous callers (EVB01);
-- this also removes them from the anonymous API surface so the security advisor stops flagging them.
-- ocpp_ingest / ocpp_poll_commands stay callable by anon on purpose: chargers authenticate with their own secret.

revoke execute on function public.start_charging(uuid) from public, anon;
revoke execute on function public.stop_charging(uuid) from public, anon;
revoke execute on function public.live_session(uuid) from public, anon;
grant execute on function public.start_charging(uuid) to authenticated;
grant execute on function public.stop_charging(uuid) to authenticated;
grant execute on function public.live_session(uuid) to authenticated;
