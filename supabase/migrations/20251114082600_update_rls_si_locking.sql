-- Tighten SI update policy: creators and DO owners can edit only when unlocked; admins always allowed

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
          AND dobj.owner_user_id = auth.uid()
        )
      )
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.is_super_admin = TRUE OR p.is_admin = TRUE OR p.is_rcdo_admin = TRUE)
    )
  );
