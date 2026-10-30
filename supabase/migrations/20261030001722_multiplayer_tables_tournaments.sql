create table public.chess_tournaments (
 id uuid primary key default gen_random_uuid(), code text unique not null,
 host_id uuid not null references auth.users(id) on delete cascade,
 capacity integer not null check(capacity in (4,8)), players uuid[] not null,
 state jsonb not null, created_at timestamptz not null default now()
);
alter table public.chess_tournaments enable row level security;
revoke all on public.chess_tournaments from public, anon, authenticated;
grant all on public.chess_tournaments to service_role;

-- Serializes joins and advancement so concurrent polls never create duplicate rounds.
create function public.tournament_action(actor uuid, operation text, invite text, capacity integer, initial_state jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare t public.chess_tournaments; entrants uuid[]; winners uuid[]; match jsonb; matches jsonb;
 archived public.game_text_history; new_code text; board jsonb; n integer; all_done boolean; rounds jsonb;
begin
 if operation='tournament_create' then
   if capacity not in (4,8) then raise exception 'Elige 4 u 8 participantes'; end if;
   if (select count(*) from public.chess_tournaments where host_id=actor and created_at>now()-interval '1 day')>=5 then raise exception 'Límite de torneos alcanzado'; end if;
   insert into public.chess_tournaments(code,host_id,capacity,players,state)
   values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),actor,capacity,array[actor],jsonb_build_object('template',initial_state,'round',0,'matches','[]'::jsonb,'rounds','[]'::jsonb,'finished',false)) returning * into t;
 else
   select * into t from public.chess_tournaments where code=invite for update;
   if not found then raise exception 'El torneo no existe'; end if;
   if operation='tournament_join' and not actor=any(t.players) then
     if cardinality(t.players)>=t.capacity then raise exception 'El torneo está lleno'; end if;
     t.players:=array_append(t.players,actor);
   end if;
   if not actor=any(t.players) then raise exception 'No perteneces a este torneo'; end if;
 end if;
 entrants:=null;
 if cardinality(t.players)=t.capacity and (t.state->>'round')::int=0 then entrants:=t.players; end if;
 if (t.state->>'round')::int>0 and not (t.state->>'finished')::boolean then
   winners:='{}';matches:='[]';all_done:=true;
   for match in select value from jsonb_array_elements(t.state->'matches') loop
     select * into archived from public.game_text_history where code=match->>'code';
     if found then
       if archived.winner in ('w','b') then
         winners:=array_append(winners,(match->>case when archived.winner='w' then 'white' else 'black' end)::uuid);
         match:=match||jsonb_build_object('winner',winners[cardinality(winners)],'result',archived.result);
       else
         -- Draws repeat the pairing, with a fresh clock and no persisted board archive.
         new_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
         board:=(t.state->'template')||jsonb_build_object('clockAt',extract(epoch from now())*1000);
         insert into public.game_rooms(code,host_id,guest_id,kind,state,seen) values(new_code,(match->>'white')::uuid,(match->>'black')::uuid,'ajedrez',board,jsonb_build_object(match->>'white',extract(epoch from now())*1000,match->>'black',extract(epoch from now())*1000));
         match:=match||jsonb_build_object('code',new_code,'replay',true);all_done:=false;
       end if;
     else all_done:=false;
     end if;
     matches:=matches||jsonb_build_array(match);
   end loop;
   t.state:=jsonb_set(t.state,'{matches}',matches);
   if all_done then
     rounds:=t.state->'rounds'||jsonb_build_array(jsonb_build_object('round',t.state->'round','matches',matches));
     t.state:=jsonb_set(t.state,'{rounds}',rounds);
     if cardinality(winners)=1 then t.state:=t.state||jsonb_build_object('finished',true,'champion',winners[1]);
     else entrants:=winners; end if;
   end if;
 end if;
 if entrants is not null then
   matches:='[]';
   for n in 1..cardinality(entrants) by 2 loop
     new_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
     board:=(t.state->'template')||jsonb_build_object('clockAt',extract(epoch from now())*1000);
     insert into public.game_rooms(code,host_id,guest_id,kind,state,seen) values(new_code,entrants[n],entrants[n+1],'ajedrez',board,jsonb_build_object(entrants[n]::text,extract(epoch from now())*1000,entrants[n+1]::text,extract(epoch from now())*1000));
     matches:=matches||jsonb_build_array(jsonb_build_object('code',new_code,'white',entrants[n],'black',entrants[n+1]));
   end loop;
   t.state:=t.state||jsonb_build_object('round',(t.state->>'round')::int+1,'matches',matches);
 end if;
 update public.chess_tournaments set players=t.players,state=t.state where id=t.id;
 -- Only heartbeat the caller's pairing while they are actually viewing the bracket.
 for match in select value from jsonb_array_elements(t.state->'matches') loop
   if actor::text in (match->>'white',match->>'black') then
     update public.game_rooms set seen=jsonb_set(seen,array[actor::text],to_jsonb(extract(epoch from now())*1000)) where code=match->>'code';
   end if;
 end loop;
 return jsonb_build_object('code',t.code,'capacity',t.capacity,'players',t.players,'me',actor,'state',t.state-'template');
end $$;
revoke all on function public.tournament_action(uuid,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.tournament_action(uuid,text,text,integer,jsonb) to service_role;

-- Chess retains the five-minute loss rule. Card tables remove only absent seats.
create or replace function public.expire_games() returns void language plpgsql security invoker set search_path=public as $$
declare room public.game_rooms; loser uuid; seats uuid[]; idx integer; remaining integer[]; abandoned jsonb; next_turn integer;
begin
 for room in select * from public.game_rooms where guest_id is not null or coalesce((state->>'started')::boolean,false) for update loop
   seats:=coalesce(room.players,array[room.host_id,room.guest_id]);
   select player into loser from unnest(seats) with ordinality as p(player,position) where not coalesce(room.state->'abandoned','[]'::jsonb) @> to_jsonb(array[position-1]) and coalesce((room.seen->>player::text)::numeric,extract(epoch from room.updated_at)*1000)<extract(epoch from now())*1000-300000 limit 1;
   if loser is null then continue; end if;
   if room.kind='ajedrez' then
     update public.game_rooms set state=state||jsonb_build_object('result','abandonment','winner',case when loser=host_id then 'b' else 'w' end) where id=room.id;
     perform public.archive_game(room.id);
   else
     idx:=array_position(seats,loser)-1;
     abandoned:=coalesce(room.state->'abandoned','[]'::jsonb)||to_jsonb(idx);
     select array_agg(i) into remaining from generate_series(0,jsonb_array_length(room.state->'hands')-1) as i where not abandoned @> to_jsonb(array[i]);
     room.state:=room.state||jsonb_build_object('abandoned',abandoned,'message','Un participante agotó el tiempo de reconexión.');
     if coalesce(cardinality(remaining),0)<=1 or room.kind='tres' then
       room.state:=room.state||jsonb_build_object('finished',true,'winner',case when cardinality(remaining)=1 then remaining[1] else null end);
     else
       if room.kind='21' then room.state:=jsonb_set(room.state,array['stood',idx::text],'true'); end if;
       if (room.state->>'turn')::int=idx then
         next_turn:=(idx+1)%jsonb_array_length(room.state->'hands');
         while abandoned @> to_jsonb(array[next_turn]) loop next_turn:=(next_turn+1)%jsonb_array_length(room.state->'hands'); end loop;
         room.state:=room.state||jsonb_build_object('turn',next_turn,'phase','draw');
       end if;
     end if;
     update public.game_rooms set state=room.state,revision=revision+1 where id=room.id;
     if (room.state->>'finished')::boolean then perform public.archive_game(room.id); end if;
   end if;
 end loop;
 delete from public.game_rooms where guest_id is null and coalesce((state->>'started')::boolean,false)=false and created_at<now()-interval '1 day';
 delete from public.chess_tournaments where (state->>'round')::int=0 and created_at<now()-interval '1 day';
end $$;
