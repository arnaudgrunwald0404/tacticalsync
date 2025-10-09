-- Drop existing problematic policies
DROP POLICY IF EXISTS "Team admins can delete team members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can insert team members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can update team members" ON public.team_members;
DROP POLICY IF EXISTS "Team members can view team members" ON public.team_members;

-- Create security definer function to check team membership and role
CREATE OR REPLACE FUNCTION public.check_team_member_role(_user_id uuid, _team_id uuid, _required_role member_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE user_id = _user_id
      AND team_id = _team_id
      AND role = _required_role
  )
$$;

-- Create security definer function to check if user is a team member (any role)
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE user_id = _user_id
      AND team_id = _team_id
  )
$$;

-- Recreate policies using security definer functions
CREATE POLICY "Team members can view team members"
ON public.team_members
FOR SELECT
USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team admins can insert team members"
ON public.team_members
FOR INSERT
WITH CHECK (public.check_team_member_role(auth.uid(), team_id, 'admin'));

CREATE POLICY "Team admins can update team members"
ON public.team_members
FOR UPDATE
USING (public.check_team_member_role(auth.uid(), team_id, 'admin'));

CREATE POLICY "Team admins can delete team members"
ON public.team_members
FOR DELETE
USING (public.check_team_member_role(auth.uid(), team_id, 'admin'));