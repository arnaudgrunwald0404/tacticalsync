-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'base64'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create enum for user roles
CREATE TYPE public.member_role AS ENUM ('admin', 'member');

-- Create team_members table
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  title TEXT,
  custom_avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- Create weekly_meetings table
CREATE TABLE public.weekly_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, week_start_date)
);

-- Create enum for item types
CREATE TYPE public.item_type AS ENUM ('agenda', 'topic');

-- Create meeting_items table
CREATE TABLE public.meeting_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.weekly_meetings(id) ON DELETE CASCADE,
  type item_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  outcome TEXT,
  assigned_to UUID REFERENCES public.profiles(id),
  time_minutes INTEGER,
  is_completed BOOLEAN DEFAULT FALSE,
  order_index INTEGER NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create comments table
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES public.meeting_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

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
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Team admins can update teams" ON public.teams FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = teams.id 
    AND team_members.user_id = auth.uid() 
    AND team_members.role = 'admin'
  ));

-- RLS Policies for team_members
CREATE POLICY "Team members can view team members" ON public.team_members FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm 
    WHERE tm.team_id = team_members.team_id 
    AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team admins can insert team members" ON public.team_members FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_members.team_id = team_members.team_id 
    AND team_members.user_id = auth.uid() 
    AND team_members.role = 'admin'
  ));

CREATE POLICY "Team admins can update team members" ON public.team_members FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm 
    WHERE tm.team_id = team_members.team_id 
    AND tm.user_id = auth.uid() 
    AND tm.role = 'admin'
  ));

CREATE POLICY "Team admins can delete team members" ON public.team_members FOR DELETE 
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm 
    WHERE tm.team_id = team_members.team_id 
    AND tm.user_id = auth.uid() 
    AND tm.role = 'admin'
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

CREATE POLICY "Team members can insert items" ON public.meeting_items FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.weekly_meetings wm
    JOIN public.team_members tm ON tm.team_id = wm.team_id
    WHERE wm.id = meeting_items.meeting_id 
    AND tm.user_id = auth.uid()
  ) AND auth.uid() = created_by);

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

CREATE POLICY "Team members can insert comments" ON public.comments FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meeting_items mi
    JOIN public.weekly_meetings wm ON wm.id = mi.meeting_id
    JOIN public.team_members tm ON tm.team_id = wm.team_id
    WHERE mi.id = comments.item_id 
    AND tm.user_id = auth.uid()
  ) AND auth.uid() = user_id);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_meeting_items_updated_at BEFORE UPDATE ON public.meeting_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();