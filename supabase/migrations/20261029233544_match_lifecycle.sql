alter table public.game_rooms add column if not exists players uuid[];
alter table public.game_rooms add column if not exists seen jsonb not null default '{}'::jsonb;
alter table public.game_rooms drop constraint if exists game_rooms_kind_check;
alter table public.game_rooms add constraint game_rooms_kind_check check (kind in ('poker','solitario','21','conquian','ajedrez','tres'));
create table public.game_text_history (
 id uuid primary key, code text unique not null, kind text not null,
 players uuid[] not null, transcript text not null, result text, winner text,
 created_at timestamptz not null default now()
);
alter table public.game_text_history enable row level security;
revoke all on public.game_text_history from anon, authenticated;
create or replace function public.archive_game(room_id uuid) returns void language plpgsql security invoker set search_path = public as $$
declare room public.game_rooms; transcript text;
begin
 select * into room from public.game_rooms where id=room_id for update;
 if not found then return; end if;
 if room.kind='ajedrez' then
 select string_agg(concat(item->'from'->>'r',',',item->'from'->>'c',',',item->'to'->>'r',',',item->'to'->>'c',',',item->>'san'), E'\n' order by ordinal) into transcript from jsonb_array_elements(room.state->'fullLog') with ordinality as logs(item,ordinal);
 else transcript := room.state::text; end if;
 insert into public.game_text_history(id,code,kind,players,transcript,result,winner) values(room.id,room.code,room.kind,coalesce(room.players,array_remove(array[room.host_id,room.guest_id],null)),coalesce(transcript,''),coalesce(room.state->>'result','finished'),room.state->>'winner') on conflict(id) do nothing;
 delete from public.game_rooms where id=room.id;
end $$;
revoke all on function public.archive_game(uuid) from public,anon,authenticated;
grant execute on function public.archive_game(uuid) to service_role;
create or replace function public.touch_game(room_id uuid, player_id uuid) returns void language sql security invoker set search_path=public as $$
 update public.game_rooms set seen=jsonb_set(seen,array[player_id::text],to_jsonb(extract(epoch from now())*1000)) where id=room_id;
$$;
revoke all on function public.touch_game(uuid,uuid) from public,anon,authenticated;
grant execute on function public.touch_game(uuid,uuid) to service_role;
create extension if not exists pg_cron;
create or replace function public.expire_games() returns void language plpgsql security invoker set search_path=public as $$
declare room public.game_rooms; loser uuid;
begin
 for room in select * from public.game_rooms where guest_id is not null or coalesce((state->>'started')::boolean,false) loop
   select player into loser from unnest(coalesce(room.players,array[room.host_id,room.guest_id])) as player where coalesce((room.seen->>player::text)::numeric,extract(epoch from room.updated_at)*1000) < extract(epoch from now())*1000-300000 limit 1;
   if loser is not null then
     update public.game_rooms set state=state || jsonb_build_object('finished',true,'result','abandonment','winner',case when kind='ajedrez' then to_jsonb(case when loser=host_id then 'b' else 'w' end) else to_jsonb(case when loser=host_id then 1 else 0 end) end,'message','Tiempo de reconexión agotado') where id=room.id;
     perform public.archive_game(room.id);
   end if;
 end loop;
 delete from public.game_rooms where guest_id is null and coalesce((state->>'started')::boolean,false)=false and created_at < now()-interval '1 day';
end $$;
revoke all on function public.expire_games() from public,anon,authenticated;
grant execute on function public.expire_games() to service_role;
select cron.schedule('gco-expire-games','* * * * *','select public.expire_games()');
