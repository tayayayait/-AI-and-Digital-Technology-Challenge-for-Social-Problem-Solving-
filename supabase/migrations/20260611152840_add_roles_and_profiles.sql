create type public.app_role as enum ('citizen', 'operator', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role public.app_role not null default 'citizen',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
    'citizen'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.has_operator_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('operator', 'admin'), false)
$$;

revoke all on function public.handle_new_user_profile() from public, anon, authenticated;
revoke all on function public.current_user_role() from public, anon, authenticated;
revoke all on function public.has_operator_access() from public, anon, authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.has_operator_access() to authenticated;

create policy "profiles_select_own_or_operator"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.has_operator_access());

create policy "profiles_update_own_display_name"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = public.current_user_role());

create policy "profiles_admin_update_roles"
on public.profiles
for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');
