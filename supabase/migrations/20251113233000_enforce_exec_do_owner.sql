-- Migration: Enforce Executive Ownership for DOs and add profiles.is_executive
-- Date: 2025-11-13 23:30:00

-- 1) Add is_executive flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_executive BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_profiles_is_executive ON profiles(is_executive) WHERE is_executive = TRUE;
COMMENT ON COLUMN profiles.is_executive IS 'User is an executive; required as owner for Defining Objectives.';

-- 2) Update RLS policies on rc_defining_objectives to enforce executive owner
-- Drop existing create/update policies so we can re-create with stricter checks
DROP POLICY IF EXISTS "Admins and RCDO admins can create defining objectives" ON rc_defining_objectives;
DROP POLICY IF EXISTS "DO owners and admins can update objectives" ON rc_defining_objectives;

-- Recreate INSERT policy: creator perms AND owner must be executive
CREATE POLICY "Admins/RCDO admins can create DOs (exec owner)" ON rc_defining_objectives
  FOR INSERT
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND (p.is_super_admin = TRUE OR p.is_admin = TRUE OR p.is_rcdo_admin = TRUE)
      )
      OR EXISTS (
        SELECT 1 FROM rc_rallying_cries rc
        WHERE rc.id = rc_defining_objectives.rallying_cry_id
        AND rc.owner_user_id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1 FROM profiles ownerp
      WHERE ownerp.id = rc_defining_objectives.owner_user_id
      AND ownerp.is_executive = TRUE
    )
  );

-- Recreate UPDATE policy: same visibility USING as before, plus WITH CHECK for exec owner
CREATE POLICY "DO owners/admins can update DOs (exec owner)" ON rc_defining_objectives
  FOR UPDATE
  USING (
    (
      locked_at IS NULL AND owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM rc_rallying_cries rc
      JOIN profiles p ON p.id = auth.uid()
      WHERE rc.id = rc_defining_objectives.rallying_cry_id
      AND (p.is_super_admin = TRUE OR p.is_admin = TRUE OR p.is_rcdo_admin = TRUE)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles ownerp
      WHERE ownerp.id = rc_defining_objectives.owner_user_id
      AND ownerp.is_executive = TRUE
    )
  );