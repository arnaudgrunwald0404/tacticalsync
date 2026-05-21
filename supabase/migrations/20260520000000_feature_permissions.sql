-- Feature permissions: role-based access control for app sections
-- Admins configure which role tags can access each feature

CREATE TABLE IF NOT EXISTS public.feature_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_key TEXT NOT NULL,
  role_tag TEXT NOT NULL CHECK (role_tag IN ('admin', 'elt', 'xlt', 'user')),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (feature_key, role_tag)
);

CREATE INDEX idx_feature_permissions_role ON public.feature_permissions (role_tag);
CREATE INDEX idx_feature_permissions_feature ON public.feature_permissions (feature_key);

ALTER TABLE public.feature_permissions ENABLE ROW LEVEL SECURITY;

-- Everyone can read (needed so the navbar can check access)
CREATE POLICY "feature_permissions_select" ON public.feature_permissions
  FOR SELECT USING (true);

-- Only super admins or users whose role_tag has manage_permissions can modify
CREATE POLICY "feature_permissions_modify" ON public.feature_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND (
        p.is_super_admin = true
        OR EXISTS (
          SELECT 1 FROM public.feature_permissions fp
          WHERE fp.feature_key = 'manage_permissions'
          AND fp.role_tag = ANY(p.role_tags)
          AND fp.is_enabled = true
        )
      )
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_feature_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feature_permissions_updated_at
  BEFORE UPDATE ON public.feature_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_permissions_updated_at();

-- Seed default permissions
INSERT INTO public.feature_permissions (feature_key, role_tag, is_enabled) VALUES
  -- Chief of Staff
  ('view_chief_of_staff', 'admin', true),
  ('view_chief_of_staff', 'elt',   true),
  ('view_chief_of_staff', 'xlt',   false),
  ('view_chief_of_staff', 'user',  false),
  -- DCI Lists (within Chief of Staff)
  ('view_dci_lists', 'admin', true),
  ('view_dci_lists', 'elt',   true),
  ('view_dci_lists', 'xlt',   false),
  ('view_dci_lists', 'user',  false),
  -- Teams Lists (within Chief of Staff)
  ('view_teams_lists', 'admin', true),
  ('view_teams_lists', 'elt',   true),
  ('view_teams_lists', 'xlt',   false),
  ('view_teams_lists', 'user',  false),
  -- My Dashboard
  ('view_dashboard', 'admin', true),
  ('view_dashboard', 'elt',   true),
  ('view_dashboard', 'xlt',   true),
  ('view_dashboard', 'user',  true),
  -- RCDO
  ('view_rcdo', 'admin', true),
  ('view_rcdo', 'elt',   true),
  ('view_rcdo', 'xlt',   true),
  ('view_rcdo', 'user',  false),
  -- Commitments
  ('view_commitments', 'admin', true),
  ('view_commitments', 'elt',   true),
  ('view_commitments', 'xlt',   true),
  ('view_commitments', 'user',  true),
  -- Meetings
  ('view_meetings', 'admin', true),
  ('view_meetings', 'elt',   true),
  ('view_meetings', 'xlt',   true),
  ('view_meetings', 'user',  true),
  -- Insights
  ('view_insights', 'admin', true),
  ('view_insights', 'elt',   false),
  ('view_insights', 'xlt',   false),
  ('view_insights', 'user',  false),
  -- Settings
  ('view_settings', 'admin', true),
  ('view_settings', 'elt',   false),
  ('view_settings', 'xlt',   false),
  ('view_settings', 'user',  false),
  -- Manage Permissions (who can edit this table)
  ('manage_permissions', 'admin', true),
  ('manage_permissions', 'elt',   false),
  ('manage_permissions', 'xlt',   false),
  ('manage_permissions', 'user',  false)
ON CONFLICT (feature_key, role_tag) DO NOTHING;
