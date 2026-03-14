-- Priority categorizations for the Insights dashboard
-- Tracks whether each priority/commitment is churn_reduction, net_new_functionality, or net_new_accounts

CREATE TABLE IF NOT EXISTS priority_categorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter_id uuid NOT NULL REFERENCES commitment_quarters(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('priority', 'commitment')),
  item_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('churn_reduction', 'net_new_functionality', 'net_new_accounts', 'uncategorized')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_type, item_id)
);

-- Index for fast lookups by quarter
CREATE INDEX idx_priority_categorizations_quarter ON priority_categorizations(quarter_id);

-- RLS
ALTER TABLE priority_categorizations ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can read categorizations"
  ON priority_categorizations FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert/update (admin check done at app layer)
CREATE POLICY "Authenticated users can insert categorizations"
  ON priority_categorizations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update categorizations"
  ON priority_categorizations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
