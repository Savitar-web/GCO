alter table public.game_rooms drop constraint if exists game_rooms_kind_check;
alter table public.game_rooms add constraint game_rooms_kind_check check(kind in ('poker','solitario','21','conquian','ajedrez','tres','fichacore'));
alter table public.chess_tournaments drop constraint if exists chess_tournaments_capacity_check;
alter table public.chess_tournaments add constraint chess_tournaments_capacity_check check(capacity between 2 and 32);
create or replace function public.tournament_action(actor uuid, operation text, invite text, capacity integer, initial_state jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare t public.chess_tournaments; entrants uuid[]; winners uuid[]; match jsonb; matches jsonb;
 archived public.game_text_history; new_code text; board jsonb; n integer; all_done boolean; rounds jsonb;
begin
 if operation='tournament_create' then
   if capacity<2 or capacity>32 then raise exception 'Elige entre 2 y 32 participantes'; end if;
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
 t.state:=jsonb_set(t.state,'{names}',coalesce(t.state->'names','{}'::jsonb)||jsonb_build_object(actor::text,left(coalesce(nullif(initial_state->>'displayName',''),'Jugador'),32)));
 entrants:=null;
 if cardinality(t.players)=t.capacity and (t.state->>'round')::int=0 then entrants:=t.players; end if;
 if (t.state->>'round')::int>0 and not (t.state->>'finished')::boolean then
   winners:='{}';matches:='[]';all_done:=true;
   for match in select value from jsonb_array_elements(t.state->'matches') loop
     if match ? 'winner' then winners:=array_append(winners,(match->>'winner')::uuid);matches:=matches||jsonb_build_array(match);continue;end if;
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
     if n=cardinality(entrants) then matches:=matches||jsonb_build_array(jsonb_build_object('code','bye-'||(t.state->>'round')||'-'||n,'white',entrants[n],'black',null,'winner',entrants[n],'bye',true));continue;end if;
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

create or replace function public.expire_games() returns void language plpgsql security invoker set search_path=public as $$
declare room public.game_rooms; loser uuid; seats uuid[]; idx integer; remaining integer[]; abandoned jsonb; next_turn integer; h jsonb; c jsonb; total integer; aces integer; rank integer; best integer; winners jsonb; player_index integer;
begin
 for room in select * from public.game_rooms where guest_id is not null or coalesce((state->>'started')::boolean,false) for update loop
   seats:=coalesce(room.players,array[room.host_id,room.guest_id]);
   select player into loser from unnest(seats) with ordinality as p(player,position) where not coalesce(room.state->'abandoned','[]'::jsonb) @> to_jsonb(array[position-1]) and coalesce((room.seen->>player::text)::numeric,extract(epoch from room.updated_at)*1000)<extract(epoch from now())*1000-300000 limit 1;
   if loser is null then continue; end if;
   if room.kind='fichacore' then
     idx:=array_position(seats,loser)-1;
     update public.game_rooms set state=state||jsonb_build_object('finished',true,'phase','finished','winner',1-(idx%2),'message','Un jugador agotó los cinco minutos para reconectarse. Gana el otro equipo.') where id=room.id;
     perform public.archive_game(room.id);continue;
   end if;
   if room.state ? 'house' then
     idx:=array_position(seats,loser)-1;
     abandoned:=coalesce(room.state->'abandoned','[]'::jsonb)||to_jsonb(idx);
     room.state:=room.state||jsonb_build_object('abandoned',abandoned,'message','Un participante agotó su tiempo de reconexión.');
     room.state:=jsonb_set(room.state,array['stood',idx::text],'true');
     if idx=(room.state->>'house')::int then
       room.state:=room.state||jsonb_build_object('finished',true,'winner',null,'message','La Casa se desconectó durante cinco minutos: mesa cancelada.');
     else
       select array_agg(i) into remaining from generate_series(0,jsonb_array_length(room.state->'hands')-1) as i where not abandoned @> to_jsonb(array[i]);
       if cardinality(remaining)=1 then room.state:=room.state||jsonb_build_object('finished',true,'winner',remaining[1],'message','Solo queda la Casa: mesa finalizada.');
       else
         if (room.state->>'pendingSeat')::int=idx then room.state:=(room.state-'pendingSeat')||jsonb_build_object('phase','play','turn',idx); end if;
         if room.state->>'phase'='deal' and not exists(select 1 from jsonb_array_elements(room.state->'hands') with ordinality as hands(hand,pos) where jsonb_array_length(hand)<2 and not abandoned @> to_jsonb(array[pos-1])) then room.state:=room.state||jsonb_build_object('phase','play','turn',1);end if;
         if room.state->>'phase'='play' then
           next_turn:=(room.state->>'turn')::int;
           while abandoned @> to_jsonb(array[next_turn]) or (room.state->'stood'->>next_turn)::boolean loop next_turn:=(next_turn+1)%jsonb_array_length(room.state->'hands'); end loop;
           room.state:=jsonb_set(room.state,'{turn}',to_jsonb(next_turn));
         end if;
       end if;
     end if;
     update public.game_rooms set state=room.state,revision=revision+1 where id=room.id;
     if coalesce((room.state->>'finished')::boolean,false) then perform public.archive_game(room.id);end if;
     continue;
   end if;
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
       if room.kind='21' then
         room.state:=jsonb_set(room.state,array['stood',idx::text],'true');
         if not exists(select 1 from jsonb_array_elements(room.state->'stood') as v where v='false'::jsonb) then
           best:=-1;winners:='[]';player_index:=0;
           for h in select value from jsonb_array_elements(room.state->'hands') loop
             total:=0;aces:=0;
             for c in select value from jsonb_array_elements(h) loop
               rank:=(c->>'rank')::int;
               total:=total+case when rank=1 then coalesce((c->>'aceValue')::int,11) else least(rank,10) end;
               if rank=1 and not c ? 'aceValue' then aces:=aces+1; end if;
             end loop;
             while total>21 and aces>0 loop total:=total-10;aces:=aces-1;end loop;
             if total>21 or abandoned @> to_jsonb(array[player_index]) then total:=-1;end if;
             if total>best then best:=total;winners:=jsonb_build_array(player_index);
             elsif total=best and best>=0 then winners:=winners||to_jsonb(player_index);end if;
             player_index:=player_index+1;
           end loop;
           room.state:=room.state||jsonb_build_object('finished',true,'winners',winners,'winner',case when jsonb_array_length(winners)=1 then winners->0 else null end,'message','Manos resueltas tras agotarse el tiempo de reconexión.');
         end if;
       end if;
       if (room.state->>'turn')::int=idx and not coalesce((room.state->>'finished')::boolean,false) then
         next_turn:=(idx+1)%jsonb_array_length(room.state->'hands');
         while abandoned @> to_jsonb(array[next_turn]) or (room.kind='21' and (room.state->'stood'->>next_turn)::boolean) loop next_turn:=(next_turn+1)%jsonb_array_length(room.state->'hands'); end loop;
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
