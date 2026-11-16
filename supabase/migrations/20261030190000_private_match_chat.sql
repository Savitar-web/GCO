create schema if not exists private;
create or replace function private.can_chat(topic text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.game_rooms r where 'game:'||r.id::text=topic and (r.host_id=auth.uid() or r.guest_id=auth.uid() or auth.uid()=any(r.players)) and r.state->>'result' is null and not coalesce((r.state->>'finished')::boolean,false))
$$;
revoke all on function private.can_chat(text) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.can_chat(text) to authenticated;
create policy game_chat_receive on realtime.messages for select to authenticated using(extension='broadcast' and private.can_chat(realtime.topic()));
create policy game_chat_send on realtime.messages for insert to authenticated with check(extension='broadcast' and private.can_chat(realtime.topic()));
