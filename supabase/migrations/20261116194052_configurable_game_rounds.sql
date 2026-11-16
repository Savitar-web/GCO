-- Each completed round keeps its own UUID; a room invitation may be reused.
alter table public.game_text_history drop constraint if exists game_text_history_code_key;
create index if not exists game_history_code_recent on public.game_text_history(code,created_at desc);
create or replace function public.game_round_configure(actor uuid, source text, initial_state jsonb, capacity integer)
returns uuid language plpgsql set search_path=public as $$
declare h public.game_text_history; participants uuid[]; next_id uuid; stamp numeric; is_seated boolean;
begin
 select * into h from public.game_text_history where code=source order by created_at desc limit 1 for update;
 if not found or h.players[1]<>actor then raise exception 'Sólo el anfitrión puede editar una partida terminada.';end if;
 if capacity<1 or capacity>10 then raise exception 'Cantidad inválida.';end if;
 if exists(select 1 from public.game_rooms where code=source) then raise exception 'El anfitrión ya abrió la siguiente partida.';end if;
 participants:=h.players[1:least(capacity,cardinality(h.players))];stamp:=extract(epoch from now())*1000;
 is_seated:=h.kind not in ('ajedrez','poker','solitario');
 if is_seated then initial_state:=jsonb_set(initial_state,'{started}',to_jsonb(cardinality(participants)=capacity and h.kind<>'fichacore'));end if;
 insert into public.game_rooms(code,kind,host_id,guest_id,players,state,seen)
 values(source,h.kind,actor,case when not is_seated then participants[2] else null end,case when is_seated then participants else null end,initial_state,(select jsonb_object_agg(p::text,stamp) from unnest(participants) p)) returning id into next_id;
 return next_id;
end $$;
revoke all on function public.game_round_configure(uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.game_round_configure(uuid,text,jsonb,integer) to service_role;
-- Existing rematch voting must read the latest completed round with this invitation.
do $$declare definition text;begin
 select pg_get_functiondef('public.game_rematch(uuid,text,boolean,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'where code=source for update','where code=source order by created_at desc limit 1 for update');
 execute definition;
end $$;
