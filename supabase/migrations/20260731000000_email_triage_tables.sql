-- email_triage_preferences: per-user opt-in toggle and learned suppression rules.
-- Populated Phase 1 (enabled toggle only); suppression fields activated Phase 2.
create table email_triage_preferences (
  user_id            uuid primary key references auth.users on delete cascade,
  enabled            boolean not null default false,
  suppressed_senders text[]  not null default '{}',
  suppressed_domains text[]  not null default '{}',
  suppressed_intents text[]  not null default '{}',
  max_thread_age_hours int,
  updated_at         timestamptz not null default now()
);

alter table email_triage_preferences enable row level security;

create policy "Users can read own email triage preferences"
  on email_triage_preferences for select
  using (auth.uid() = user_id);

create policy "Users can upsert own email triage preferences"
  on email_triage_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users can update own email triage preferences"
  on email_triage_preferences for update
  using (auth.uid() = user_id);

-- email_dismissal_log: raw signal store for the Phase 2 learning loop.
-- Written whenever a user dismisses an email-sourced inbox card.
create table email_dismissal_log (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users on delete cascade,
  inbox_item_id    uuid        references inbox_items(id) on delete set null,
  sender_email     text,
  sender_tier      text        check (sender_tier in ('active', 'known')),
  intent_type      text,
  sender_domain    text,
  thread_age_hours int,
  dismissed_at     timestamptz not null default now()
);

alter table email_dismissal_log enable row level security;

create policy "Users can read own dismissal log"
  on email_dismissal_log for select
  using (auth.uid() = user_id);

create policy "Users can insert own dismissal log"
  on email_dismissal_log for insert
  with check (auth.uid() = user_id);

create index email_dismissal_log_user_id_idx on email_dismissal_log (user_id);
create index email_dismissal_log_sender_email_idx on email_dismissal_log (user_id, sender_email);
