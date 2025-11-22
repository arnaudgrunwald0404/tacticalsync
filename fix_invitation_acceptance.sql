-- =============================================================================
-- PRODUCTION FIX: Allow users to accept/decline team invitations
-- =============================================================================
-- 
-- PROBLEM:
-- Users can see invitations on their dashboard but get an error when clicking
-- "Accept Invitation" because there's no RLS policy allowing them to UPDATE
-- the invitation status.
--
-- Current situation:
-- ✅ Users CAN view invitations (SELECT policy exists)
-- ❌ Users CANNOT update invitations (missing UPDATE policy)
-- ✅ Team admins CAN manage invitations (but invited users aren't admins yet!)
--
-- SOLUTION:
-- Add an UPDATE policy that allows users to update invitations sent to their
-- email address. This allows them to accept or decline invitations.
--
-- =============================================================================

-- Check if the policy already exists (just in case)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'invitations' 
        AND policyname = 'Users can update invitations sent to them'
    ) THEN
        RAISE NOTICE 'Policy already exists, dropping it first...';
        DROP POLICY "Users can update invitations sent to them" ON public.invitations;
    END IF;
END $$;

-- Create the UPDATE policy for users to accept/decline invitations
CREATE POLICY "Users can update invitations sent to them" ON public.invitations
  FOR UPDATE
  USING (
    -- Match by JWT email (case-insensitive)
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

-- Verify the policy was created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'invitations'
AND policyname = 'Users can update invitations sent to them';

-- =============================================================================
-- SUCCESS! 
-- After running this script, users will be able to accept/decline invitations.
-- =============================================================================





