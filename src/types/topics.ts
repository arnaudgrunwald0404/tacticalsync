import { Profile } from "./meeting";
import { CompletionStatus } from "./priorities";

export interface Topic {
  id: string;
  instance_id: string;
  title: string;
  notes?: string | null;
  assigned_to?: string | null;
  time_minutes?: number | null;
  completion_status: CompletionStatus;
  order_index: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  assigned_to_profile?: Profile | null;
}

export interface TopicInsert {
  instance_id: string;
  title: string;
  notes?: string | null;
  assigned_to?: string | null;
  time_minutes?: number | null;
  completion_status?: CompletionStatus;
  order_index: number;
  created_by: string;
}

export interface TopicUpdate {
  title?: string;
  notes?: string | null;
  assigned_to?: string | null;
  time_minutes?: number | null;
  completion_status?: CompletionStatus;
  order_index?: number;
}

// Form state interfaces
export interface TopicFormData {
  title: string;
  notes: string;
  assigned_to: string | null;
  time_minutes: number;
}
