-- Create invitations table to track pending invitations
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  status invitation_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Create enum for invitation status
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'declined');

-- Create index for better query performance
CREATE INDEX idx_invitations_team_id ON public.invitations(team_id);
CREATE INDEX idx_invitations_email ON public.invitations(email);
CREATE INDEX idx_invitations_status ON public.invitations(status);

-- RLS Policies for invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view their team invitations" ON public.invitations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = invitations.team_id
    AND team_members.user_id = auth.uid()
  ));

CREATE POLICY "Team admins can manage invitations" ON public.invitations
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = invitations.team_id
    AND team_members.user_id = auth.uid()
    AND team_members.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.team_id = invitations.team_id
    AND team_members.user_id = auth.uid()
    AND team_members.role = 'admin'
  ));

-- Allow users to accept invitations (for the join flow)
CREATE POLICY "Users can accept their invitations" ON public.invitations FOR UPDATE
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
