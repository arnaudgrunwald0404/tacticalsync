-- =============================================================================
-- FINAL PRODUCTION SQL - Run all of these in your Supabase SQL Editor
-- =============================================================================

-- Step 1: Fix RLS policy to allow team members to view invitations
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view invitations sent to them or their team invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can view invitations sent to them or their team invitatio" ON public.invitations;
DROP POLICY IF EXISTS "Users can view their invitations or team invitations" ON public.invitations;

CREATE POLICY "Team members can view team invitations and users can view their own"
  ON public.invitations
  FOR SELECT
  USING (
    -- Team members can see all invitations for their teams
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = invitations.team_id
      AND team_members.user_id = auth.uid()
    )
    OR
    -- Users can see invitations sent to their email (via profiles table)
    email IN (
      SELECT email FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- Step 2: Prevent duplicate pending invitations
-- -----------------------------------------------------------------------------
-- First, remove any existing duplicate invitations (keep the most recent one)
DELETE FROM public.invitations a
USING public.invitations b
WHERE a.id < b.id
  AND a.email = b.email
  AND a.team_id = b.team_id
  AND a.status = 'pending'
  AND b.status = 'pending';

-- Create a unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_unique_pending_email_team
  ON public.invitations (email, team_id)
  WHERE status = 'pending';

-- =============================================================================
-- SUMMARY OF CHANGES
-- =============================================================================
-- 1. Fixed RLS policy so team members can view all invitations for their team
-- 2. Added database constraint to prevent duplicate pending invitations
-- 3. Frontend now checks for duplicates and shows "Resend" button instead
-- =============================================================================

