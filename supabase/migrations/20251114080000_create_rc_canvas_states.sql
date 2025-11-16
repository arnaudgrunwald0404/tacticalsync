-- Canvas snapshots for the Strategy Canvas (ReactFlow graph)
-- Stores nodes and edges JSON for a given room key (e.g., "strategy-canvas-room")

create table if not exists public.rc_canvas_states (
  room text primary key,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Keep updated_at fresh
drop trigger if exists update_rc_canvas_states_updated_at on public.rc_canvas_states;
create trigger update_rc_canvas_states_updated_at
  before update on public.rc_canvas_states
  for each row execute function public.update_updated_at_column();

-- Enable RLS
alter table public.rc_canvas_states enable row level security;

-- Policies
-- Everyone authenticated can read the shared canvas
do $$ begin
  create policy "Authenticated users can view canvas" on public.rc_canvas_states
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- Authenticated users can insert the initial snapshot
do $$ begin
  create policy "Authenticated users can insert canvas" on public.rc_canvas_states
    for insert with check (auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- Authenticated users can update the shared canvas
-- If you later want to restrict to admins, replace the USING with a profiles.is_admin check
do $$ begin
  create policy "Authenticated users can update canvas" on public.rc_canvas_states
    for update using (auth.uid() is not null);
exception when duplicate_object then null; end $$;
