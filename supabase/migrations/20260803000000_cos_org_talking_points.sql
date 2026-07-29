-- Org-wide (or, in a future phase, team-wide) recurring talking points that
-- an admin/leadership persona injects into every direct-report 1:1's prep
-- for a bounded period. See PLAN_idea11_org_wide_talking_points.md.

CREATE TABLE cos_org_talking_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date NOT NULL,
  -- v1 is always company-wide; this column exists so a 'team' value can be
  -- added later (see plan §2.5) without a schema migration for the column
  -- itself. Do NOT allow any other value until team-targeting is built.
  target_scope text NOT NULL DEFAULT 'company' CHECK (target_scope IN ('company')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE INDEX idx_cos_org_talking_points_active_window
  ON cos_org_talking_points(active, starts_on, ends_on);

ALTER TABLE cos_org_talking_points ENABLE ROW LEVEL SECURITY;

-- Company-wide read (§1.7/§2.3) — every authenticated user can see active
-- talking points; the frontend/backend further filter to direct_report
-- 1:1s only (§2.7), which is a UI/query concern, not an RLS concern (an
-- admin-authored talking point is not sensitive the way a manager's own
-- notes are — see cos_manager_signal_* views' contrasting owner-only shape).
CREATE POLICY "All authenticated users can view org talking points"
  ON cos_org_talking_points FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and super admins can create org talking points"
  ON cos_org_talking_points FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Admins and super admins can update org talking points"
  ON cos_org_talking_points FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

CREATE POLICY "Admins and super admins can delete org talking points"
  ON cos_org_talking_points FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

-- cos_set_updated_at() already exists (defined in
-- 20260419000000_create_cos_tables.sql and reused by
-- cos_one_on_one_prep_updated_at / cos_prep_schedule_updated_at).
CREATE TRIGGER cos_org_talking_points_updated_at
  BEFORE UPDATE ON cos_org_talking_points
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();

-- Per-(manager, direct report) dismissal (§2.6) — owner-only, same shape as
-- every other cos_* per-user table (e.g. cos_meeting_actions, §1.2).
CREATE TABLE cos_org_talking_point_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talking_point_id uuid NOT NULL REFERENCES cos_org_talking_points(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES cos_team_members(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (talking_point_id, user_id, team_member_id)
);

CREATE INDEX idx_cos_org_tp_dismissals_lookup
  ON cos_org_talking_point_dismissals(user_id, team_member_id);

ALTER TABLE cos_org_talking_point_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own org talking point dismissals"
  ON cos_org_talking_point_dismissals FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
