-- Migration: Remove is_executive column and related constraints
-- This field is no longer needed as any user can own a DO

-- 1) Drop the index
DROP INDEX IF EXISTS idx_profiles_is_executive;

-- 2) Update RLS policies on rc_defining_objectives to remove executive requirement
DROP POLICY IF EXISTS "Admins/RCDO admins can create DOs (exec owner)" ON rc_defining_objectives;
DROP POLICY IF EXISTS "DO owners/admins can update DOs (exec owner)" ON rc_defining_objectives;

-- Recreate INSERT policy without executive check
CREATE POLICY "Admins/RCDO admins can create DOs" ON rc_defining_objectives
  FOR INSERT
  WITH CHECK (
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
  );

-- Recreate UPDATE policy without executive check
CREATE POLICY "DO owners/admins can update DOs" ON rc_defining_objectives
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
  WITH CHECK (true);

-- 3) Drop the column from profiles
ALTER TABLE profiles DROP COLUMN IF EXISTS is_executive;

-- 4) Update comments to reflect removal of executive requirement
COMMENT ON TABLE rc_defining_objectives IS 'Company-wide Defining Objectives tied to Rallying Cries. Any user can be an owner.';

