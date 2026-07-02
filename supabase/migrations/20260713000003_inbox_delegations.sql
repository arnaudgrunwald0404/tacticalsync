CREATE TABLE inbox_delegations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid NOT NULL REFERENCES inbox_items(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'ramping_up'
                   CHECK (status IN ('ramping_up', 'clarifying', 'planning', 'getting_it_done', 'seeking_approval', 'done', 'cancelled')),
  -- Agent's running log of reasoning steps
  agent_log      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Current clarifying question being asked  { question, choices: string[] }
  current_question jsonb,
  -- Accumulated answers keyed by question text
  answers        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Generated plan (markdown)
  plan           text,
  -- Final result / output
  result         text,
  -- What needs approval
  approval_summary text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inbox_delegations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their delegations"
  ON inbox_delegations FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX inbox_delegations_item_id ON inbox_delegations (item_id);
CREATE INDEX inbox_delegations_user_id ON inbox_delegations (user_id);
