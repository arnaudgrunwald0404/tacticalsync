-- Add created_by to rc_defining_objectives and extend SI update policy to include DO creators (when unlocked)

-- 1) Add created_by to DOs with FK to profiles
ALTER TABLE rc_defining_objectives
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE rc_defining_objectives
  DROP CONSTRAINT IF EXISTS rc_defining_objectives_created_by_fkey,
  ADD CONSTRAINT rc_defining_objectives_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- 2) Update SI UPDATE policy to also allow DO creators when unlocked
DO $$ BEGIN
  DROP POLICY IF EXISTS "Initiative owners and admins can update initiatives" ON rc_strategic_initiatives;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Initiative owners and admins can update initiatives" ON rc_strategic_initiatives
  FOR UPDATE USING (
    (
      locked_at IS NULL AND (
        owner_user_id = auth.uid()
        OR created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM rc_defining_objectives dobj
          WHERE dobj.id = rc_strategic_initiatives.defining_objective_id
          AND (
            dobj.owner_user_id = auth.uid()
            OR dobj.created_by = auth.uid()
          )
        )
      )
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = TRUE OR p.is_admin = TRUE OR p.is_rcdo_admin = TRUE)
    )
  );
