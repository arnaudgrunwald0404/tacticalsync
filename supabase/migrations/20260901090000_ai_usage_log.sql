-- AI usage monitoring
-- Adds ai_usage_log: one row per Anthropic API call made by an edge function,
-- written via service role by _shared/aiUsage.ts. Read from the admin-only
-- "AI Usage" panel in Settings. Cost is computed at display time from
-- src/lib/aiPricing.ts so pricing changes never require rewriting history.
--
-- prep_generation_log predates this table and stays as-is (it also drives
-- rate limiting); the four prep functions now log to both.

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_creation_input_tokens integer NOT NULL DEFAULT 0,
  cache_read_input_tokens integer NOT NULL DEFAULT 0,
  -- Nullable: cron-driven functions (inbox syncs, sweeps) run without a
  -- single requesting user.
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created
  ON ai_usage_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_fn_created
  ON ai_usage_log(function_name, created_at DESC);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Admin-only read. Inserts come exclusively from edge functions using the
-- service role (bypasses RLS), so no INSERT policy for authenticated.
CREATE POLICY "Admins can view AI usage logs"
  ON ai_usage_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

-- Daily rollup queried by the Settings panel. security_invoker so the
-- admin-only RLS on ai_usage_log applies to callers of the view.
CREATE VIEW ai_usage_daily
  WITH (security_invoker = true) AS
SELECT
  (created_at AT TIME ZONE 'utc')::date AS usage_date,
  function_name,
  model,
  count(*)::integer                        AS call_count,
  sum(input_tokens)::bigint                AS input_tokens,
  sum(output_tokens)::bigint               AS output_tokens,
  sum(cache_creation_input_tokens)::bigint AS cache_creation_input_tokens,
  sum(cache_read_input_tokens)::bigint     AS cache_read_input_tokens
FROM ai_usage_log
GROUP BY 1, 2, 3;
