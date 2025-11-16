-- Allow team members to view profiles of RCDO owners (DO/RC/SI), even if owners are not team members

-- Add a SELECT policy on profiles that grants visibility of any profile referenced as an owner
-- of an RCDO entity that the current user can see via their team membership. This complements
-- existing policies and does not weaken general restrictions.

DO $$ BEGIN
  CREATE POLICY "Team members can view RCDO owners" ON public.profiles
    FOR SELECT
    USING (
      -- DO owners for DOs in teams where viewer is a member
      EXISTS (
        SELECT 1
        FROM public.rc_defining_objectives d
        JOIN public.rc_rallying_cries rc ON rc.id = d.rallying_cry_id
        JOIN public.rc_cycles c ON c.id = rc.cycle_id
        JOIN public.team_members tm ON tm.team_id = c.team_id AND tm.user_id = auth.uid()
        WHERE profiles.id = d.owner_user_id
      )
      OR
      -- Rallying Cry owners in viewer's teams
      EXISTS (
        SELECT 1
        FROM public.rc_rallying_cries rc
        JOIN public.rc_cycles c ON c.id = rc.cycle_id
        JOIN public.team_members tm ON tm.team_id = c.team_id AND tm.user_id = auth.uid()
        WHERE profiles.id = rc.owner_user_id
      )
      OR
      -- SI owners for SIs under DOs in viewer's teams
      EXISTS (
        SELECT 1
        FROM public.rc_strategic_initiatives si
        JOIN public.rc_defining_objectives d2 ON d2.id = si.defining_objective_id
        JOIN public.rc_rallying_cries rc2 ON rc2.id = d2.rallying_cry_id
        JOIN public.rc_cycles c2 ON c2.id = rc2.cycle_id
        JOIN public.team_members tm2 ON tm2.team_id = c2.team_id AND tm2.user_id = auth.uid()
        WHERE profiles.id = si.owner_user_id
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;