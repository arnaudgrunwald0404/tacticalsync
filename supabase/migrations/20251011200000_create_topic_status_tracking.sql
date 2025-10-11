-- Create table for tracking topic completion status
CREATE TABLE IF NOT EXISTS public.topic_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES public.meeting_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('done', 'in_progress', 'blocked', 'not_started')),
  updated_by UUID NOT NULL REFERENCES public.profiles(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique constraint to ensure only one status per topic
CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_status_unique_topic ON public.topic_status(topic_id);

-- Enable RLS
ALTER TABLE public.topic_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Team members can view topic statuses for their team's meetings
CREATE POLICY "Team members can view topic statuses" ON public.topic_status
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_items mi
      JOIN public.weekly_meetings wm ON mi.meeting_id = wm.id
      JOIN public.team_members tm ON wm.team_id = tm.team_id
      WHERE mi.id = topic_status.topic_id
      AND tm.user_id = auth.uid()
    )
  );

-- Topic owners and admins can update status
CREATE POLICY "Topic owners and admins can update status" ON public.topic_status
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_items mi
      JOIN public.weekly_meetings wm ON mi.meeting_id = wm.id
      JOIN public.team_members tm ON wm.team_id = tm.team_id
      WHERE mi.id = topic_status.topic_id
      AND tm.user_id = auth.uid()
      AND (
        mi.assigned_to = auth.uid() -- Topic owner
        OR tm.role = 'admin' -- Team admin
      )
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_topic_status_topic_id ON public.topic_status(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_status_updated_at ON public.topic_status(updated_at DESC);

