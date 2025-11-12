-- =============================================================================
-- Fix: Allow users to accept/decline invitations sent to their email
-- Migration: 20251111000000_allow_users_to_accept_invitations.sql
-- 
-- Problem: Users can VIEW invitations (SELECT policy exists) but cannot 
-- UPDATE them to accept/decline because there's no UPDATE policy for regular users.
-- Only team admins can update invitations, but invited users aren't team members yet.
--
-- Solution: Add an UPDATE policy that allows users to update invitations 
-- sent to their email address (for accepting/declining invitations).
-- =============================================================================

-- Create policy that allows users to update invitations sent to them
CREATE POLICY "Users can update invitations sent to them" ON public.invitations
  FOR UPDATE
  USING (
    -- Match by JWT email (case-insensitive) - same logic as SELECT policy
    LOWER(email) = LOWER(auth.jwt() ->> 'email')
    OR
    -- Match by profiles table email (case-insensitive)
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND LOWER(profiles.email) = LOWER(invitations.email)
    )
  )
  WITH CHECK (
    -- Same conditions for the check constraint
    LOWER(email) = LOWER(auth.jwt() ->> 'email')
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND LOWER(profiles.email) = LOWER(invitations.email)
    )
  );

COMMENT ON POLICY "Users can update invitations sent to them" ON public.invitations IS 
'Allows users to update (accept/decline) invitations sent to their email address. Uses case-insensitive email matching via JWT and profiles table.';

