create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('poker', 'solitario', '21', 'conquian', 'ajedrez')),
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete set null,
  state jsonb not null,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (host_id is distinct from guest_id)
);
alter table public.game_rooms enable row level security;
revoke all on public.game_rooms from anon, authenticated;
create index if not exists game_rooms_host_idx on public.game_rooms(host_id);
create index if not exists game_rooms_guest_idx on public.game_rooms(guest_id);
