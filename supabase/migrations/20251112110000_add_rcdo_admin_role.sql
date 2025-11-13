-- Migration: Add RCDO Admin Role
-- Adds is_rcdo_admin field to profiles table for managing RCDO finalization permissions

-- Add is_rcdo_admin column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_rcdo_admin BOOLEAN DEFAULT FALSE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_rcdo_admin ON profiles(is_rcdo_admin) WHERE is_rcdo_admin = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN profiles.is_rcdo_admin IS 'Indicates if user has RCDO Admin privileges (can finalize/lock RCDO cycles, rallying cries, and DOs)';

-- Update RLS policies to use RCDO admin role for finalizing/locking operations

-- ============================================================================
-- RC CYCLES - Update policies for activation (finalizing)
-- ============================================================================

DROP POLICY IF EXISTS "Cycle creators and admins can update cycles" ON rc_cycles;

CREATE POLICY "Cycle creators and admins can update cycles" ON rc_cycles
  FOR UPDATE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true)
    )
  );

-- New policy specifically for activating cycles (changing to active status)
CREATE POLICY "RCDO admins can activate cycles" ON rc_cycles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_rcdo_admin = true OR p.is_super_admin = true)
    )
  );

-- ============================================================================
-- RC RALLYING CRIES - Update locking policies
-- ============================================================================

DROP POLICY IF EXISTS "Owners and admins can update rallying cries" ON rc_rallying_cries;

CREATE POLICY "Owners and admins can update rallying cries" ON rc_rallying_cries
  FOR UPDATE USING (
    (locked_at IS NULL AND owner_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true OR p.is_rcdo_admin = true)
    )
  );

-- ============================================================================
-- RC DEFINING OBJECTIVES - Update locking policies
-- ============================================================================

DROP POLICY IF EXISTS "DO owners and admins can update objectives" ON rc_defining_objectives;

CREATE POLICY "DO owners and admins can update objectives" ON rc_defining_objectives
  FOR UPDATE USING (
    (locked_at IS NULL AND owner_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true OR p.is_rcdo_admin = true)
    )
  );

-- ============================================================================
-- RC STRATEGIC INITIATIVES - Update locking policies
-- ============================================================================

DROP POLICY IF EXISTS "Initiative owners and admins can update initiatives" ON rc_strategic_initiatives;

CREATE POLICY "Initiative owners and admins can update initiatives" ON rc_strategic_initiatives
  FOR UPDATE USING (
    (locked_at IS NULL AND owner_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true OR p.is_rcdo_admin = true)
    )
  );

-- ============================================================================
-- Grant RCDO Admin permissions for creating cycles
-- ============================================================================

DROP POLICY IF EXISTS "Admins and super admins can create cycles" ON rc_cycles;

CREATE POLICY "Admins and RCDO admins can create cycles" ON rc_cycles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true OR p.is_rcdo_admin = true)
    )
  );

-- ============================================================================
-- Grant RCDO Admin permissions for creating rallying cries
-- ============================================================================

DROP POLICY IF EXISTS "Admins can create rallying cries" ON rc_rallying_cries;

CREATE POLICY "Admins and RCDO admins can create rallying cries" ON rc_rallying_cries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true OR p.is_rcdo_admin = true)
    )
    OR EXISTS (
      SELECT 1 FROM rc_cycles c
      WHERE c.id = rc_rallying_cries.cycle_id
      AND c.created_by = auth.uid()
    )
  );

-- ============================================================================
-- Grant RCDO Admin permissions for creating DOs
-- ============================================================================

DROP POLICY IF EXISTS "Admins can create defining objectives" ON rc_defining_objectives;

CREATE POLICY "Admins and RCDO admins can create defining objectives" ON rc_defining_objectives
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = true OR p.is_admin = true OR p.is_rcdo_admin = true)
    )
    OR EXISTS (
      SELECT 1 FROM rc_rallying_cries rc
      WHERE rc.id = rc_defining_objectives.rallying_cry_id
      AND rc.owner_user_id = auth.uid()
    )
  );

