alter table public.game_text_history add column if not exists settings jsonb not null default '{}'::jsonb;
create or replace function public.archive_game(room_id uuid) returns void language plpgsql security invoker set search_path = public as $$
declare room public.game_rooms; transcript text;
begin
 select * into room from public.game_rooms where id=room_id for update;
 if not found then return; end if;
 if room.kind='ajedrez' then
 select string_agg(concat(item->'from'->>'r',',',item->'from'->>'c',',',item->'to'->>'r',',',item->'to'->>'c',',',item->>'san'), E'\n' order by ordinal) into transcript from jsonb_array_elements(room.state->'fullLog') with ordinality as logs(item,ordinal);
 else transcript := room.state::text; end if;
 insert into public.game_text_history(id,code,kind,players,transcript,result,winner,settings) values(room.id,room.code,room.kind,coalesce(room.players,array_remove(array[room.host_id,room.guest_id],null)),coalesce(transcript,''),coalesce(room.state->>'result','finished'),room.state->>'winner',coalesce(room.state->'rematchConfig','{}'::jsonb)) on conflict(id) do nothing;
 delete from public.game_rooms where id=room.id;
end $$;

-- Only the authenticated Edge Function can coordinate invitations and read aggregates.
alter table public.game_text_history add column if not exists rematch jsonb;
create index if not exists game_history_players_gin on public.game_text_history using gin(players);
create or replace function public.game_rematch(actor uuid, source text, accept boolean, initial_state jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare h public.game_text_history; accepted uuid[]; next_code text; participants uuid[]; stamp numeric; next_state jsonb; voting jsonb;
begin
 select * into h from public.game_text_history where code=source for update;
 if not found or not(actor=any(h.players)) then raise exception 'No perteneces a esta partida.';end if;
 participants:=h.players;stamp:=extract(epoch from now())*1000;voting:=h.rematch;
 if voting is not null and voting->>'code' is not null then return voting;end if;
 if voting is null or (voting->>'at')::numeric<stamp-600000 then voting:=jsonb_build_object('at',stamp,'accepted','[]'::jsonb);end if;
 select coalesce(array_agg(value::uuid),'{}'::uuid[]) into accepted from jsonb_array_elements_text(voting->'accepted');
 if accept and not(actor=any(accepted)) then accepted:=array_append(accepted,actor);end if;
 voting:=voting||jsonb_build_object('accepted',to_jsonb(accepted),'players',cardinality(participants));
 if accept and cardinality(accepted)=cardinality(participants) then
  next_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  next_state:=initial_state||jsonb_build_object('clockAt',stamp,'turnStartedAt',stamp);
  if h.kind in ('tres','21','conquian') then next_state:=next_state||jsonb_build_object('started',true);end if;
  if h.kind in ('tres','21','conquian','fichacore') then
   insert into public.game_rooms(code,host_id,players,kind,state,seen) values(next_code,participants[1],participants,h.kind,next_state,(select jsonb_object_agg(p::text,stamp) from unnest(participants) p));
  else
   insert into public.game_rooms(code,host_id,guest_id,kind,state,seen) values(next_code,participants[1],participants[2],h.kind,next_state,(select jsonb_object_agg(p::text,stamp) from unnest(participants) p));
  end if;
  voting:=voting||jsonb_build_object('code',next_code);
 end if;
 if accept then update public.game_text_history set rematch=voting where id=h.id;end if;
 return voting;
end $$;
revoke all on function public.game_rematch(uuid,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.game_rematch(uuid,text,boolean,jsonb) to service_role;

create or replace function public.game_wins(participants uuid[], game_kind text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare totals jsonb:='{}';h record;s jsonb;i integer;player uuid;won boolean;winner_index integer;
begin
 for h in select players,winner,transcript,kind from public.game_text_history where kind=game_kind and players&&participants loop
  s:=case when h.kind='ajedrez' then '{}'::jsonb else h.transcript::jsonb end;
  winner_index:=case when h.winner~'^[0-9]+$' then h.winner::integer else null end;
  for i in 1..cardinality(h.players) loop
   player:=h.players[i];if not(player=any(participants)) then continue;end if;
   won:=case when h.kind='ajedrez' then h.winner=case when i=1 then 'w' else 'b' end
    when s->'outcomes' is not null then s->'outcomes'->>(i-1)='win'
    when h.kind='fichacore' or (h.kind='tres' and coalesce((s->>'teams')::boolean,false)) then winner_index is not null and (i-1)%2=winner_index%2
    when s->'winners' is not null then s->'winners' @> to_jsonb(array[i-1])
    else winner_index=i-1 end;
   if coalesce(won,false) then totals:=jsonb_set(totals,array[player::text],to_jsonb(coalesce((totals->>player::text)::integer,0)+1));end if;
  end loop;
 end loop;
 return totals;
end $$;
revoke all on function public.game_wins(uuid[],text) from public,anon,authenticated;
grant execute on function public.game_wins(uuid[],text) to service_role;
