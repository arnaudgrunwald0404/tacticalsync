-- Add super admin support to meeting_instances INSERT policy
DROP POLICY IF EXISTS "Team members can create meeting instances" ON public.meeting_instances;
CREATE POLICY "Team members can create meeting instances" ON public.meeting_instances
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meeting_series ms
      JOIN public.team_members tm ON tm.team_id = ms.team_id
      WHERE ms.id = meeting_instances.series_id
      AND tm.user_id = auth.uid()
    )
    -- Allow super admins to create meeting instances
    OR public.is_super_admin()
  );

