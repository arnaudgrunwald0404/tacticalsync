-- Make commitment_quarters company-wide so all users see the same quarters.
-- Only admins (is_admin / is_super_admin on profiles) can create/manage quarters.

-- ─── Schema: make team_id nullable ────────────────────────────────────────────

ALTER TABLE commitment_quarters ALTER COLUMN team_id DROP NOT NULL;

-- ─── Drop old team-scoped RLS policies ────────────────────────────────────────

-- commitment_quarters
DROP POLICY IF EXISTS "Team members can view commitment quarters" ON commitment_quarters;
DROP POLICY IF EXISTS "Team admins can manage commitment quarters" ON commitment_quarters;

-- quarterly_priorities (renamed from personal_priorities — policies followed the rename)
DROP POLICY IF EXISTS "Managers can view direct reports priorities" ON quarterly_priorities;
DROP POLICY IF EXISTS "Team admins can view all priorities in their team" ON quarterly_priorities;

-- monthly_commitments
DROP POLICY IF EXISTS "Managers can view direct reports commitments" ON monthly_commitments;
DROP POLICY IF EXISTS "Team admins can view all commitments in their team" ON monthly_commitments;

-- ─── New company-wide RLS policies: commitment_quarters ───────────────────────

CREATE POLICY "All authenticated users can view commitment quarters"
  ON commitment_quarters FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can create commitment quarters"
  ON commitment_quarters FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Admins can update commitment quarters"
  ON commitment_quarters FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Super admins can delete commitment quarters"
  ON commitment_quarters FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_super_admin = true
    )
  );

-- ─── New RLS policies: personal_priorities / quarterly_priorities ──────────────
-- (Table was renamed; use the current name)

CREATE POLICY "Managers can view direct reports priorities"
  ON quarterly_priorities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_reporting_lines trl
      WHERE trl.manager_id = auth.uid()
        AND trl.report_id = quarterly_priorities.user_id
    )
  );

CREATE POLICY "Admins can view all priorities"
  ON quarterly_priorities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

-- ─── New RLS policies: monthly_commitments ────────────────────────────────────

CREATE POLICY "Managers can view direct reports commitments"
  ON monthly_commitments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_reporting_lines trl
      WHERE trl.manager_id = auth.uid()
        AND trl.report_id = monthly_commitments.user_id
    )
  );

CREATE POLICY "Admins can view all commitments"
  ON monthly_commitments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );
