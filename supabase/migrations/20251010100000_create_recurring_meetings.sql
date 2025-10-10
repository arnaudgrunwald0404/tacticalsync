-- Create recurring_meetings table to support multiple meetings per team
CREATE TABLE IF NOT EXISTS public.recurring_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  frequency meeting_frequency NOT NULL DEFAULT 'weekly',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add recurring_meeting_id to weekly_meetings table
ALTER TABLE public.weekly_meetings 
ADD COLUMN IF NOT EXISTS recurring_meeting_id UUID REFERENCES public.recurring_meetings(id) ON DELETE CASCADE;

-- Enable RLS on recurring_meetings
ALTER TABLE public.recurring_meetings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recurring_meetings
CREATE POLICY "Team members can view their recurring meetings" ON public.recurring_meetings FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = recurring_meetings.team_id 
    AND team_members.user_id = auth.uid()
  ));

CREATE POLICY "Team admins can create recurring meetings" ON public.recurring_meetings FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = recurring_meetings.team_id 
    AND team_members.user_id = auth.uid()
    AND team_members.role = 'admin'
  ));

CREATE POLICY "Team admins can update recurring meetings" ON public.recurring_meetings FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = recurring_meetings.team_id 
    AND team_members.user_id = auth.uid()
    AND team_members.role = 'admin'
  ));

CREATE POLICY "Team admins can delete recurring meetings" ON public.recurring_meetings FOR DELETE 
  USING (EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = recurring_meetings.team_id 
    AND team_members.user_id = auth.uid()
    AND team_members.role = 'admin'
  ));

-- Migrate existing teams with frequency to recurring_meetings
-- Create a default "Tactical Meeting" for each team that has a frequency set
INSERT INTO public.recurring_meetings (team_id, name, frequency, created_by)
SELECT 
  t.id as team_id,
  CASE 
    WHEN t.frequency = 'daily' THEN 'Daily Tactical'
    WHEN t.frequency = 'weekly' THEN 'Weekly Tactical'
    WHEN t.frequency = 'bi-weekly' THEN 'Bi-weekly Tactical'
    WHEN t.frequency = 'monthly' THEN 'Monthly Tactical'
    ELSE 'Weekly Tactical'
  END as name,
  COALESCE(t.frequency, 'weekly'::meeting_frequency) as frequency,
  t.created_by
FROM public.teams t
WHERE t.frequency IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update existing weekly_meetings to reference the new recurring_meetings
-- This assumes one recurring meeting per team for now
UPDATE public.weekly_meetings wm
SET recurring_meeting_id = rm.id
FROM public.recurring_meetings rm
WHERE wm.team_id = rm.team_id
AND wm.recurring_meeting_id IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_recurring_meetings_team_id ON public.recurring_meetings(team_id);
CREATE INDEX IF NOT EXISTS idx_weekly_meetings_recurring_meeting_id ON public.weekly_meetings(recurring_meeting_id);

