// Common types used across the application

export interface Profile {
  id: string;
  email?: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  avatar_name?: string | null;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  created_at: string;
  profiles?: Profile | null;
}

export interface Team {
  id: string;
  name: string;
  description?: string | null;
  created_by: string;
  created_at: string;
}

export interface MeetingTopic {
  id: string;
  meeting_id: string;
  title: string;
  type: string;
  order_index: number;
  assigned_to?: string | null;
  outcome?: string | null;
  created_at: string;
  created_by: string;
}

export interface Comment {
  id: string;
  topic_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: Profile | null;
}

export interface MeetingSeries {
  id: string;
  team_id: string;
  name: string;
  frequency: string;
  created_by: string;
  created_at: string;
  parking_lot?: string;
}

export interface MeetingInstance {
  id: string;
  series_id: string;
  start_date: string;
  end_date?: string | null;
  created_at: string;
}

