-- This project's default ACL (ALTER DEFAULT PRIVILEGES on schema public, set
-- up at project creation) grants EXECUTE directly to anon/authenticated on
-- every newly created function, independent of the PUBLIC pseudo-role.
-- Several migrations in this batch documented an authenticated-only (or
-- internal/trigger-only) intent in their own comments — e.g.
-- get_cos_team_member_invite_preview's "Requires authenticated caller
-- (EXECUTE not granted to anon)... to mirror the existing JoinTeam.tsx
-- auth-gate UX" — but never actually revoked the default anon grant, so an
-- unauthenticated caller could invoke them via PostgREST RPC the whole time.
-- Confirmed via Supabase's security advisor
-- (anon_security_definer_function_executable) immediately after this batch
-- was first deployed.
--
-- Trigger functions + the service-role-only try_transition_delegation_step
-- should never be callable by anon OR authenticated directly: trigger
-- invocation doesn't go through the grant system (so this has zero effect on
-- the triggers themselves), and try_transition_delegation_step is only ever
-- called by delegate-inbox-task using the service_role key.
REVOKE EXECUTE ON FUNCTION try_transition_delegation_step(uuid, text, text[], text, uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION sync_cos_meeting_action_to_inbox() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION archive_inbox_item_on_cos_meeting_action_delete() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION sync_inbox_item_status_to_source() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION sync_meeting_action_item_to_inbox() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION archive_inbox_item_on_meeting_action_item_delete() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_validate_inbox_item_delegation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_sync_delegation_on_delegatee_item_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_sync_delegation_on_cancel() FROM anon, authenticated;

-- Client-callable RPCs: keep authenticated (their documented intent), drop
-- the anon access that was never supposed to exist.
REVOKE EXECUTE ON FUNCTION get_inbox_delegation_display_names(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION get_cos_team_member_invite_preview(text) FROM anon;
REVOKE EXECUTE ON FUNCTION claim_cos_team_member_invite(text) FROM anon;
REVOKE EXECUTE ON FUNCTION unlink_cos_team_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION set_onboarding_flag(text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION set_feature_announcement_flag(text, boolean) FROM anon;
