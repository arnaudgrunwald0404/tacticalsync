-- Add 'test_user' as a selectable role tag for hand-picking beta/test users.
-- Test users appear as a dedicated column in the Feature Visibility permissions
-- matrix and can be toggled per-user in the Users admin page.

-- Widen the CHECK constraint to include 'test_user'
ALTER TABLE public.feature_permissions
  DROP CONSTRAINT IF EXISTS feature_permissions_role_tag_check;

ALTER TABLE public.feature_permissions
  ADD CONSTRAINT feature_permissions_role_tag_check
  CHECK (role_tag IN ('admin', 'elt', 'xlt', 'user', 'test_user'));

-- Seed test_user rows for every existing feature key.
-- Defaults mirror the 'user' role so test users start with standard access;
-- admins can then selectively enable unreleased features for this group.
INSERT INTO public.feature_permissions (feature_key, role_tag, is_enabled) VALUES
  ('view_chief_of_staff', 'test_user', false),
  ('view_dci_lists',      'test_user', false),
  ('view_teams_lists',    'test_user', false),
  ('view_dashboard',      'test_user', true),
  ('view_rcdo',           'test_user', false),
  ('view_commitments',    'test_user', true),
  ('view_meetings',       'test_user', true),
  ('view_insights',       'test_user', false),
  ('view_settings',       'test_user', false),
  ('manage_permissions',  'test_user', false)
ON CONFLICT (feature_key, role_tag) DO NOTHING;
