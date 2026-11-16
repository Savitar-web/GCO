create table public.account_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 0,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 8000000)
);
alter table public.account_progress enable row level security;
revoke all on public.account_progress from anon, authenticated;
grant select, insert, update on public.account_progress to authenticated;
create policy account_progress_read on public.account_progress for select to authenticated
  using ((select auth.uid()) = user_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false));
create policy account_progress_insert on public.account_progress for insert to authenticated
  with check ((select auth.uid()) = user_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false));
create policy account_progress_update on public.account_progress for update to authenticated
  using ((select auth.uid()) = user_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false))
  with check ((select auth.uid()) = user_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false));
