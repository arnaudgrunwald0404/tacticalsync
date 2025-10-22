-- Complete Database Setup for Team Tactical Sync
-- Run this entire file in your Supabase SQL Editor

-- =============================================================================
-- INITIAL SCHEMA SETUP
-- =============================================================================

-- Create profiles table for user data
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create teams table
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  abbreviated_name TEXT,
  standing_agenda_items JSONB DEFAULT '[]'::jsonb,
  created_by UUID,
  invite_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'base64'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create enum for user roles
DO $$ BEGIN
  CREATE TYPE public.member_role AS ENUM ('admin', 'member');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create team_members table
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  title TEXT,
  custom_avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- Create enum for item types
DO $$ BEGIN
  CREATE TYPE public.item_type AS ENUM ('agenda', 'topic');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create enum for meeting frequency
DO $$ BEGIN
  CREATE TYPE public.meeting_frequency AS ENUM ('daily', 'weekly', 'bi-weekly', 'monthly');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create recurring_meetings table
CREATE TABLE IF NOT EXISTS public.recurring_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  frequency meeting_frequency NOT NULL DEFAULT 'weekly',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create weekly_meetings table
CREATE TABLE IF NOT EXISTS public.weekly_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  recurring_meeting_id UUID REFERENCES public.recurring_meetings(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, week_start_date)
);

-- Create meeting_items table
CREATE TABLE IF NOT EXISTS public.meeting_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.weekly_meetings(id) ON DELETE CASCADE,
  type item_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  outcome TEXT,
  notes TEXT,
  assigned_to UUID REFERENCES public.profiles(id),
  time_minutes INTEGER,
  is_completed BOOLEAN DEFAULT FALSE,
  order_index INTEGER NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create comments table
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES public.meeting_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add frequency column to teams table (if not exists)
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS frequency meeting_frequency DEFAULT 'weekly';

-- Add personality columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS birthday DATE,
ADD COLUMN IF NOT EXISTS red_percentage INTEGER,
ADD COLUMN IF NOT EXISTS blue_percentage INTEGER,
ADD COLUMN IF NOT EXISTS green_percentage INTEGER,
ADD COLUMN IF NOT EXISTS yellow_percentage INTEGER;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Team members can view their teams" ON public.teams;
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
DROP POLICY IF EXISTS "Team admins can update teams" ON public.teams;
DROP POLICY IF EXISTS "Team admins can delete teams" ON public.teams;
DROP POLICY IF EXISTS "Team members can view members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can manage members" ON public.team_members;
DROP POLICY IF EXISTS "Users can join teams" ON public.team_members;
DROP POLICY IF EXISTS "Team members can view their recurring meetings" ON public.recurring_meetings;
DROP POLICY IF EXISTS "Team admins can create recurring meetings" ON public.recurring_meetings;
DROP POLICY IF EXISTS "Team admins can update recurring meetings" ON public.recurring_meetings;
DROP POLICY IF EXISTS "Team admins can delete recurring meetings" ON public.recurring_meetings;
DROP POLICY IF EXISTS "Team members can view meetings" ON public.weekly_meetings;
DROP POLICY IF EXISTS "Team members can create meetings" ON public.weekly_meetings;
DROP POLICY IF EXISTS "Team members can view items" ON public.meeting_items;
DROP POLICY IF EXISTS "Team members can create items" ON public.meeting_items;
DROP POLICY IF EXISTS "Team members can update items" ON public.meeting_items;
DROP POLICY IF EXISTS "Team members can delete items" ON public.meeting_items;
DROP POLICY IF EXISTS "Team members can view comments" ON public.comments;
DROP POLICY IF EXISTS "Team members can create comments" ON public.comments;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for teams
CREATE POLICY "Team members can view their teams" ON public.teams FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = teams.id 
    AND team_members.user_id = auth.uid()
  ));

CREATE POLICY "Authenticated users can create teams" ON public.teams FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Team admins can update teams" ON public.teams FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = teams.id 
    AND team_members.user_id = auth.uid()
    AND team_members.role = 'admin'
  ));

CREATE POLICY "Team admins can delete teams" ON public.teams FOR DELETE 
  USING (EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = teams.id 
    AND team_members.user_id = auth.uid()
    AND team_members.role = 'admin'
  ));

-- RLS Policies for team_members
CREATE POLICY "Team members can view members" ON public.team_members FOR SELECT 
  USING (true); -- Allow viewing all team members for now

CREATE POLICY "Team admins can update members" ON public.team_members 
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm 
    WHERE tm.team_id = team_members.team_id 
    AND tm.user_id = auth.uid()
    AND tm.role = 'admin'
  ));

CREATE POLICY "Team admins can delete members" ON public.team_members 
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm 
    WHERE tm.team_id = team_members.team_id 
    AND tm.user_id = auth.uid()
    AND tm.role = 'admin'
  ));

CREATE POLICY "Users can join teams" ON public.team_members 
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Team creators can add themselves as admin" ON public.team_members 
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    AND role = 'admin'
    AND EXISTS (
      SELECT 1 FROM public.teams t 
      WHERE t.id = team_id 
      AND t.created_by = auth.uid()
    )
  );

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

-- RLS Policies for weekly_meetings
CREATE POLICY "Team members can view meetings" ON public.weekly_meetings FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = weekly_meetings.team_id 
    AND team_members.user_id = auth.uid()
  ));

CREATE POLICY "Team members can create meetings" ON public.weekly_meetings FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = weekly_meetings.team_id 
    AND team_members.user_id = auth.uid()
  ));

-- RLS Policies for meeting_items
CREATE POLICY "Team members can view items" ON public.meeting_items FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.weekly_meetings wm
    JOIN public.team_members tm ON tm.team_id = wm.team_id
    WHERE wm.id = meeting_items.meeting_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team members can create items" ON public.meeting_items FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.weekly_meetings wm
    JOIN public.team_members tm ON tm.team_id = wm.team_id
    WHERE wm.id = meeting_items.meeting_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team members can update items" ON public.meeting_items FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.weekly_meetings wm
    JOIN public.team_members tm ON tm.team_id = wm.team_id
    WHERE wm.id = meeting_items.meeting_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team members can delete items" ON public.meeting_items FOR DELETE 
  USING (EXISTS (
    SELECT 1 FROM public.weekly_meetings wm
    JOIN public.team_members tm ON tm.team_id = wm.team_id
    WHERE wm.id = meeting_items.meeting_id 
    AND tm.user_id = auth.uid()
  ));

-- RLS Policies for comments
CREATE POLICY "Team members can view comments" ON public.comments FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.meeting_items mi
    JOIN public.weekly_meetings wm ON wm.id = mi.meeting_id
    JOIN public.team_members tm ON tm.team_id = wm.team_id
    WHERE mi.id = comments.item_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team members can create comments" ON public.comments FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meeting_items mi
    JOIN public.weekly_meetings wm ON wm.id = mi.meeting_id
    JOIN public.team_members tm ON tm.team_id = wm.team_id
    WHERE mi.id = comments.item_id 
    AND tm.user_id = auth.uid()
  ));

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to check if user is team member
CREATE OR REPLACE FUNCTION public.is_team_member(_team_id UUID, _user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check team member role
CREATE OR REPLACE FUNCTION public.check_team_member_role(
  _team_id UUID,
  _user_id UUID,
  _required_role member_role
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id 
    AND user_id = _user_id 
    AND role = _required_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_meetings_team_id ON public.recurring_meetings(team_id);
CREATE INDEX IF NOT EXISTS idx_weekly_meetings_team_id ON public.weekly_meetings(team_id);
CREATE INDEX IF NOT EXISTS idx_weekly_meetings_recurring_meeting_id ON public.weekly_meetings(recurring_meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_items_meeting_id ON public.meeting_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_comments_item_id ON public.comments(item_id);
CREATE INDEX IF NOT EXISTS idx_teams_abbreviated_name ON public.teams(abbreviated_name);

-- =============================================================================
-- INVITATIONS TABLE
-- =============================================================================

-- Create enum for invitation status
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'declined');

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

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_invitations_team_id ON public.invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.invitations(status);

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

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_first_name TEXT;
  user_last_name TEXT;
  user_full_name TEXT;
  user_avatar_url TEXT;
BEGIN
  -- Extract data from OAuth metadata
  user_first_name := NEW.raw_user_meta_data->>'given_name';
  user_last_name := NEW.raw_user_meta_data->>'family_name';
  user_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
  
  -- Build full name from first and last, or use provided full_name
  user_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    CASE 
      WHEN user_first_name IS NOT NULL AND user_last_name IS NOT NULL 
      THEN user_first_name || ' ' || user_last_name
      WHEN user_first_name IS NOT NULL 
      THEN user_first_name
      ELSE NEW.email
    END
  );

  INSERT INTO public.profiles (
    id, 
    email, 
    full_name,
    first_name,
    last_name,
    avatar_url
  )
  VALUES (
    NEW.id,
    NEW.email,
    user_full_name,
    user_first_name,
    user_last_name,
    user_avatar_url
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- DONE!
-- =============================================================================

