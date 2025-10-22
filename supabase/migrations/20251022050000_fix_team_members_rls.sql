-- Fix infinite recursion in team_members RLS by using SECURITY DEFINER helpers
-- This migration is safe to run multiple times

-- Helper functions that bypass RLS (security definer) and avoid recursion
create or replace function public.is_team_member(_team_id uuid, _user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = _team_id and user_id = _user_id
  );
$$;

create or replace function public.is_team_admin(_team_id uuid, _user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = _team_id and user_id = _user_id and role = 'admin'
  );
$$;

-- Ensure RLS is enabled (idempotent in Supabase/Postgres)
alter table if exists public.team_members enable row level security;

-- Drop potentially-recursive/legacy policies on team_members
-- (present across various setup scripts/migrations)
drop policy if exists "Users can view team members of their teams" on public.team_members;
drop policy if exists "Team admins can manage team members" on public.team_members;
drop policy if exists "Team members can view members" on public.team_members;
drop policy if exists "Team admins can update members" on public.team_members;
drop policy if exists "Team admins can delete members" on public.team_members;

-- Keep existing INSERT policies that do not recurse (if present):
--   "Users can join teams" and "Team creators can add themselves as admin"
-- Recreate non-recursive SELECT/UPDATE/DELETE policies using helper functions
create policy "Members can select team_members"
  on public.team_members
  for select
  using (public.is_team_member(team_members.team_id, auth.uid()));

create policy "Admins can update team_members"
  on public.team_members
  for update
  using (public.is_team_admin(team_members.team_id, auth.uid()));

create policy "Admins can delete team_members"
  on public.team_members
  for delete
  using (public.is_team_admin(team_members.team_id, auth.uid()));
