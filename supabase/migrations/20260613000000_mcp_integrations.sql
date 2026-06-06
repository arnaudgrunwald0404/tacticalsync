-- MCP Integration connections — per-user API integration credentials & state
create table if not exists cos_mcp_integrations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  integration_key text not null,           -- e.g. 'cleargo'
  base_url    text not null default '',
  auth_value  text,                        -- API key / token (RLS-protected)
  is_connected boolean not null default false,
  last_test_at timestamptz,
  last_test_status text,                   -- 'ok' | 'error'
  last_test_error text,
  config      jsonb not null default '{}', -- extra per-integration settings
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (user_id, integration_key)
);

-- RLS: users can only see/manage their own integrations
alter table cos_mcp_integrations enable row level security;

create policy "Users manage own integrations"
  on cos_mcp_integrations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for quick lookup
create index if not exists idx_mcp_integrations_user
  on cos_mcp_integrations (user_id);
