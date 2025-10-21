export interface AgendaItem {
  id: string;
  title: string;
  notes?: string | null;
  assigned_to?: string | null;
  time_minutes?: number | null;
  order_index: number;
  is_completed?: boolean;
  desired_outcomes?: string | null;
  activities?: string | null;
}

export interface AgendaItemWithProfile extends AgendaItem {
  assigned_to_profile?: {
    id: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    avatar_url?: string;
    avatar_name?: string;
  } | null;
  created_by_profile?: {
    id: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    avatar_url?: string;
    avatar_name?: string;
  } | null;
}

export interface AgendaTemplate {
  id: string;
  name: string;
  description?: string;
  is_system: boolean;
  created_at: string;
  items: AgendaTemplateItem[];
}

export interface AgendaTemplateItem {
  id: string;
  template_id: string;
  title: string;
  duration_minutes: number;
  order_index: number;
  created_at: string;
}