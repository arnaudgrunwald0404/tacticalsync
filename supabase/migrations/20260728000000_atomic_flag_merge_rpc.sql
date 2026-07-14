-- Fixes a lost-update race in the "dismiss a one-time tutorial/announcement"
-- flow: useOnboardingState.markComplete() and useFeatureAnnouncement.markSeen()
-- each read the current jsonb flag blob into local React state, spread the
-- newly-dismissed key into it, and write the whole object back. When two
-- independent instances of these hooks are mounted at once — e.g. the two
-- banners on Inbox.tsx each running their own useFeatureAnnouncement(), or
-- useOnboardingState() called from both ChiefOfStaff.tsx and its nested
-- TeamSection — the second writer's stale in-memory copy overwrites whatever
-- flag the first writer just persisted. The dismissed banner's flag flips
-- back to false in the DB, so it reappears on the next load even though the
-- user already closed it.
--
-- Fix: merge the single flag into the jsonb column atomically in Postgres
-- with the `||` operator, so each dismiss is independent of any other
-- writer's in-memory snapshot.

CREATE OR REPLACE FUNCTION set_onboarding_flag(p_key text, p_value boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  INSERT INTO cos_settings (user_id, onboarding_completed, updated_at)
  VALUES (auth.uid(), jsonb_build_object(p_key, p_value), now())
  ON CONFLICT (user_id) DO UPDATE
    SET onboarding_completed = cos_settings.onboarding_completed || jsonb_build_object(p_key, p_value),
        updated_at = now()
  RETURNING onboarding_completed INTO v_result;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION set_onboarding_flag(text, boolean) IS
  'Atomically merges a single key into cos_settings.onboarding_completed via '
  'jsonb || so concurrent callers (e.g. multiple useOnboardingState() '
  'instances mounted at once) cannot clobber each other''s flags. '
  'SECURITY DEFINER only to allow the INSERT ... ON CONFLICT upsert; still '
  'only ever reads/writes the caller''s own row via auth.uid().';

GRANT EXECUTE ON FUNCTION set_onboarding_flag(text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION set_feature_announcement_flag(p_key text, p_value boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  UPDATE profiles
     SET feature_announcements = feature_announcements || jsonb_build_object(p_key, p_value)
   WHERE id = auth.uid()
  RETURNING feature_announcements INTO v_result;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION set_feature_announcement_flag(text, boolean) IS
  'Atomically merges a single key into profiles.feature_announcements via '
  'jsonb || so concurrent callers (e.g. two banners on Inbox.tsx each '
  'running their own useFeatureAnnouncement() instance) cannot clobber each '
  'other''s flags. Scoped to the caller''s own row via auth.uid() in the '
  'WHERE clause.';

GRANT EXECUTE ON FUNCTION set_feature_announcement_flag(text, boolean) TO authenticated;
