-- Fix RLS policy to allow users to view invitations sent to their email address
-- This is the missing piece that prevents users from seeing invitations sent to them

-- Add policy to allow users to view invitations sent to their email
-- Use auth.jwt() to get the user's email instead of querying auth.users
CREATE POLICY "Users can view invitations sent to them" ON invitations
  FOR SELECT USING (
    email = (auth.jwt() ->> 'email')
  );

-- Also allow users to update invitations sent to them (for accept/decline)
CREATE POLICY "Users can update invitations sent to them" ON invitations
  FOR UPDATE USING (
    email = (auth.jwt() ->> 'email')
  );
