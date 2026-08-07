-- Extend the SI UPDATE policy so profiles.role_tags (admin/elt/xlt) grant the
-- same "Manage SIs" edit capability that Settings' Permissions Matrix already
-- advertises. Previously only the legacy is_admin/is_super_admin/is_rcdo_admin
-- booleans were honored here, so a user granted an elevated role_tag (without
-- the matching legacy boolean) would see an editable status control in the
-- app but have every write silently rejected by RLS (no error, zero rows
-- affected) — this is the actual root cause behind "I'm an admin but can't
-- edit this SI's status." app-layer checks in useRCDOPermissions.ts already
-- account for role_tags; this brings the database policy in line.

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
      AND (
        p.is_super_admin = TRUE
        OR p.is_admin = TRUE
        OR p.is_rcdo_admin = TRUE
        OR p.role_tags && ARRAY['admin', 'elt', 'xlt']::text[]
      )
    )
  );
