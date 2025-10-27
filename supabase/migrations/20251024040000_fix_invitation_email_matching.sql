-- Fix invitation viewing policy to be case-insensitive and use profiles table
-- This ensures users can see invitations regardless of email case matching

DROP POLICY IF EXISTS "Users can view invitations sent to them" ON public.invitations;

CREATE POLICY "Users can view invitations sent to them" ON public.invitations
  FOR SELECT
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
  );
