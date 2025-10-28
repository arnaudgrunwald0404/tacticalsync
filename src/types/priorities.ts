import { Profile } from "./meeting";

export type CompletionStatus = 'completed' | 'not_completed' | 'pending';

export interface Priority {
  id: string;
  instance_id: string;
  outcome: string;
  activities?: string | null;
  assigned_to?: string | null;
  completion_status: CompletionStatus;
  order_index: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  assigned_to_profile?: Profile | null;
}

export interface PriorityInsert {
  instance_id: string;
  outcome: string;
  activities?: string | null;
  assigned_to?: string | null;
  completion_status?: CompletionStatus;
  order_index: number;
  created_by: string;
}

export interface PriorityUpdate {
  outcome?: string;
  activities?: string | null;
  assigned_to?: string | null;
  completion_status?: CompletionStatus;
  order_index?: number;
}

// Form state interfaces
export interface PriorityFormData {
  outcome: string;
  activities: string;
  assigned_to: string | null;
}

// Local UI row representation used in the AddPrioritiesDrawer flow
export interface PriorityRow {
  id: string;
  priority: string; // desired outcome (rich text)
  activities: string; // supporting activities (rich text)
  assigned_to: string; // user id (empty string means unassigned)
  time_minutes: number | null;
}

export interface AddPrioritiesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  teamId: string;
  onSave: () => void;
  existingPriorities?: Priority[];
  frequency?: "daily" | "weekly" | "bi-weekly" | "monthly" | "quarter";
}