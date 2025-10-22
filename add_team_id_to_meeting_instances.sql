-- Add team_id to meeting_instances and policies to match frontend expectations
-- Run this in the Supabase SQL editor (or supabase db push)

BEGIN;

-- 1) Add column and backfill from recurring_meetings
ALTER TABLE public.meeting_instances
  ADD COLUMN IF NOT EXISTS team_id uuid;

UPDATE public.meeting_instances mi
SET team_id = rm.team_id
FROM public.recurring_meetings rm
WHERE mi.recurring_meeting_id = rm.id
  AND mi.team_id IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE public.meeting_instances
  ALTER COLUMN team_id SET NOT NULL;

-- 2) Add FK and helpful indexes
ALTER TABLE public.meeting_instances
  DROP CONSTRAINT IF EXISTS meeting_instances_team_id_fkey,
  ADD CONSTRAINT meeting_instances_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_meeting_instances_team_start
  ON public.meeting_instances(team_id, start_date);
CREATE INDEX IF NOT EXISTS idx_meeting_instances_recurring_start
  ON public.meeting_instances(recurring_meeting_id, start_date);

-- 3) Enable RLS + policies (members can read, admins can create/update/delete)
ALTER TABLE public.meeting_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view meeting instances" ON public.meeting_instances;
DROP POLICY IF EXISTS "Team admins can manage meeting instances" ON public.meeting_instances;
DROP POLICY IF EXISTS "Team members can create own meeting instances" ON public.meeting_instances;

CREATE POLICY "Team members can view meeting instances"
  ON public.meeting_instances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = meeting_instances.team_id
      AND tm.user_id = auth.uid()
    )
  );

-- Allow creation by any team member (adjust to admins-only by adding AND tm.role = 'admin')
CREATE POLICY "Team members can create meeting instances"
  ON public.meeting_instances FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = meeting_instances.team_id
      AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Team admins can update/delete meeting instances"
  ON public.meeting_instances FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = meeting_instances.team_id
      AND tm.user_id = auth.uid() AND tm.role = 'admin'
    )
  );

CREATE POLICY "Team admins can delete meeting instances"
  ON public.meeting_instances FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = meeting_instances.team_id
      AND tm.user_id = auth.uid() AND tm.role = 'admin'
    )
  );

COMMIT;