alter table public.game_rooms drop constraint if exists game_rooms_kind_check;
alter table public.game_rooms add constraint game_rooms_kind_check check(kind in ('poker','solitario','21','conquian','ajedrez','tres','fichacore','loteria','dibujar','pescar','domino','damas-chinas','monopoli'));
create table if not exists public.game_media(path text primary key,room_id uuid not null references public.game_rooms(id) on delete cascade,owner_id uuid not null references auth.users(id) on delete cascade,kind text not null check(kind in ('image','audio')),mime text not null,created_at timestamptz not null default now());
create index if not exists game_media_room_idx on public.game_media(room_id);
create index if not exists game_media_owner_created_idx on public.game_media(owner_id,created_at);
alter table public.game_media enable row level security;
revoke all on public.game_media from public,anon,authenticated;
grant all on public.game_media to service_role;
create table if not exists public.game_media_cleanup(path text primary key,room_id uuid not null,created_at timestamptz not null default now(),attempts integer not null default 0);
alter table public.game_media_cleanup enable row level security;
revoke all on public.game_media_cleanup from public,anon,authenticated;
grant all on public.game_media_cleanup to service_role;
create table if not exists public.game_chat_limits(room_id uuid not null references public.game_rooms(id) on delete cascade,player_id uuid not null references auth.users(id) on delete cascade,at timestamptz not null default now(),primary key(room_id,player_id));
alter table public.game_chat_limits enable row level security;
revoke all on public.game_chat_limits from public,anon,authenticated;
grant all on public.game_chat_limits to service_role;
create or replace function public.reserve_game_chat(room_key uuid,actor uuid) returns void language plpgsql security invoker set search_path='' as $$
declare r public.game_rooms; previous timestamptz;
begin
 select * into r from public.game_rooms where id=room_key for update;
 if not found or not coalesce(r.host_id=actor or r.guest_id=actor or actor=any(r.players),false) or r.state->>'result' is not null or coalesce((r.state->>'finished')::boolean,false) then raise exception 'La conversación terminó o no perteneces a esta sala.';end if;
 select at into previous from public.game_chat_limits where room_id=room_key and player_id=actor;
 if previous>now()-interval '650 milliseconds' then raise exception 'Espera un momento antes de enviar otro mensaje.';end if;
 insert into public.game_chat_limits(room_id,player_id,at) values(room_key,actor,now()) on conflict(room_id,player_id) do update set at=excluded.at;
end $$;
revoke all on function public.reserve_game_chat(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_game_chat(uuid,uuid) to service_role;
create or replace function private.enqueue_game_media() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.game_media_cleanup(path,room_id) select path,room_id from public.game_media where room_id=old.id on conflict(path) do nothing;
 delete from public.game_media where room_id=old.id;
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;
revoke all on function private.enqueue_game_media() from public,anon,authenticated;
drop trigger if exists queue_media_on_room_delete on public.game_rooms;
create trigger queue_media_on_room_delete before delete on public.game_rooms for each row execute function private.enqueue_game_media();
drop trigger if exists queue_media_on_finish on public.game_rooms;
create trigger queue_media_on_finish before update of state on public.game_rooms for each row when ((new.state->>'result' is not null or coalesce((new.state->>'finished')::boolean,false)) and old.state->>'result' is null and not coalesce((old.state->>'finished')::boolean,false)) execute function private.enqueue_game_media();
create or replace function private.can_read_game_media(object_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.game_media m join public.game_rooms r on r.id=m.room_id where m.path=object_path and (r.host_id=auth.uid() or r.guest_id=auth.uid() or auth.uid()=any(r.players)) and r.state->>'result' is null and not coalesce((r.state->>'finished')::boolean,false))
$$;
revoke all on function private.can_read_game_media(text) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.can_read_game_media(text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('match-media','match-media',false,3145728,array['image/webp','audio/webm','audio/mp4','audio/ogg','audio/wav','audio/x-m4a']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists match_media_read on storage.objects;
create policy match_media_read on storage.objects for select to authenticated using(bucket_id='match-media' and private.can_read_game_media(name));
drop policy if exists match_media_upload on storage.objects;
create policy match_media_upload on storage.objects for insert to authenticated with check(bucket_id='match-media' and (storage.foldername(name))[2]=(select auth.uid())::text and private.can_read_game_media(name));
drop policy if exists match_media_delete on storage.objects;
create policy match_media_delete on storage.objects for delete to authenticated using(bucket_id='match-media' and (storage.foldername(name))[2]=(select auth.uid())::text and private.can_read_game_media(name));
-- Clients only receive. Messages and typing events are authenticated by the Edge Function.
drop policy if exists game_chat_send on realtime.messages;
create extension if not exists pg_net with schema extensions;
create or replace function private.request_game_media_cleanup() returns void language plpgsql security invoker set search_path='' as $$
declare secret text;
begin
 if not exists(select 1 from public.game_media_cleanup) then return;end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='gco_media_cleanup_token';
 if secret is null then return;end if;
 perform net.http_post(url:='https://kjbfdjjwljmhsizjrqkk.supabase.co/functions/v1/game',headers:=jsonb_build_object('Content-Type','application/json','x-cleanup-token',secret),body:='{"op":"cleanup_media"}'::jsonb,timeout_milliseconds:=10000);
end $$;
revoke all on function private.request_game_media_cleanup() from public,anon,authenticated;
do $$begin if not exists(select 1 from cron.job where jobname='gco-media-cleanup') then perform cron.schedule('gco-media-cleanup','* * * * *','select private.request_game_media_cleanup()');end if;end $$;

CREATE OR REPLACE FUNCTION public.expire_games()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare room public.game_rooms; loser uuid; seats uuid[]; idx integer; remaining integer[]; abandoned jsonb; next_turn integer; h jsonb; c jsonb; total integer; aces integer; rank integer; best integer; winners jsonb; player_index integer;
begin
 for room in select * from public.game_rooms where guest_id is not null or coalesce((state->>'started')::boolean,false) for update loop
   seats:=coalesce(room.players,array[room.host_id,room.guest_id]);
   select player into loser from unnest(seats) with ordinality as p(player,position) where not coalesce(room.state->'abandoned','[]'::jsonb) @> to_jsonb(array[position-1]) and coalesce((room.seen->>player::text)::numeric,extract(epoch from room.updated_at)*1000)<extract(epoch from now())*1000-300000 limit 1;
   if loser is null then continue; end if;
   if room.kind in ('loteria','dibujar','pescar','domino','damas-chinas','monopoli') then
     idx:=array_position(seats,loser)-1;
     update public.game_rooms set state=state||jsonb_build_object('finished',true,'phase','finished','winner',case when cardinality(seats)=2 then 1-idx else null end,'winners',case when cardinality(seats)=2 then jsonb_build_array(1-idx) else '[]'::jsonb end,'message','La partida terminó tras cinco minutos sin conexión de un participante.') where id=room.id;
     perform public.archive_game(room.id);continue;
   end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.archive_game(room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare room public.game_rooms; transcript text;
begin
 select * into room from public.game_rooms where id=room_id for update;
 if not found then return; end if;
 if room.kind='ajedrez' then
 select string_agg(concat(item->'from'->>'r',',',item->'from'->>'c',',',item->'to'->>'r',',',item->'to'->>'c',',',item->>'san'), E'\n' order by ordinal) into transcript from jsonb_array_elements(room.state->'fullLog') with ordinality as logs(item,ordinal);
 elsif room.kind='dibujar' then transcript := (room.state #- '{drawing,strokes}' #- '{drawing,guesses}')::text;
 else transcript := room.state::text; end if;
 insert into public.game_text_history(id,code,kind,players,transcript,result,winner,settings) values(room.id,room.code,room.kind,coalesce(room.players,array_remove(array[room.host_id,room.guest_id],null)),coalesce(transcript,''),coalesce(room.state->>'result','finished'),room.state->>'winner',coalesce(room.state->'rematchConfig','{}'::jsonb)) on conflict(id) do nothing;
 delete from public.game_rooms where id=room.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.game_rematch(actor uuid, source text, accept boolean, initial_state jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  if h.kind in ('tres','21','conquian','fichacore','loteria','dibujar','pescar','domino','damas-chinas','monopoli') then
   insert into public.game_rooms(code,host_id,players,kind,state,seen) values(next_code,participants[1],participants,h.kind,next_state,(select jsonb_object_agg(p::text,stamp) from unnest(participants) p));
  else
   insert into public.game_rooms(code,host_id,guest_id,kind,state,seen) values(next_code,participants[1],participants[2],h.kind,next_state,(select jsonb_object_agg(p::text,stamp) from unnest(participants) p));
  end if;
  voting:=voting||jsonb_build_object('code',next_code);
 end if;
 if accept then update public.game_text_history set rematch=voting where id=h.id;end if;
 return voting;
end $function$
;
