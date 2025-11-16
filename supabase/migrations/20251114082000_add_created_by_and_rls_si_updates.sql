-- Add created_by to rc_strategic_initiatives and extend RLS to allow SI creator and DO owner to update

-- 1) Add created_by column and FK to profiles (nullable; app will set)
ALTER TABLE rc_strategic_initiatives
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE rc_strategic_initiatives
  DROP CONSTRAINT IF EXISTS rc_strategic_initiatives_created_by_fkey,
  ADD CONSTRAINT rc_strategic_initiatives_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- 2) Update UPDATE policy to include SI creator and DO owner
DO $$ BEGIN
  DROP POLICY IF EXISTS "Initiative owners and admins can update initiatives" ON rc_strategic_initiatives;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Initiative owners and admins can update initiatives" ON rc_strategic_initiatives
  FOR UPDATE USING (
    (
      locked_at IS NULL
      AND owner_user_id = auth.uid()
    )
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM rc_defining_objectives dobj
      WHERE dobj.id = rc_strategic_initiatives.defining_objective_id
      AND dobj.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = TRUE OR p.is_admin = TRUE OR p.is_rcdo_admin = TRUE)
    )
  );
