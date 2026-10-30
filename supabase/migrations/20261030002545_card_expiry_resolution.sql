create or replace function public.expire_games() returns void language plpgsql security invoker set search_path=public as $$
declare room public.game_rooms; loser uuid; seats uuid[]; idx integer; remaining integer[]; abandoned jsonb; next_turn integer; h jsonb; c jsonb; total integer; aces integer; rank integer; best integer; winners jsonb; player_index integer;
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
       if room.kind='21' then
         room.state:=jsonb_set(room.state,array['stood',idx::text],'true');
         if not exists(select 1 from jsonb_array_elements(room.state->'stood') as v where v='false'::jsonb) then
           best:=-1;winners:='[]';player_index:=0;
           for h in select value from jsonb_array_elements(room.state->'hands') loop
             total:=0;aces:=0;
             for c in select value from jsonb_array_elements(h) loop
               rank:=(c->>'rank')::int;
               total:=total+case when rank=1 then 11 else least(rank,10) end;
               if rank=1 then aces:=aces+1; end if;
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
