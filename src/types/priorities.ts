import { Profile } from "./meeting";

export type CompletionStatus = 'completed' | 'not_completed';

export interface Priority {
  id: string;
  instance_id: string;
  title: string;
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
  title: string;
  outcome: string;
  activities?: string | null;
  assigned_to?: string | null;
  completion_status?: CompletionStatus;
  order_index: number;
  created_by: string;
}

export interface PriorityUpdate {
  title?: string;
  outcome?: string;
  activities?: string | null;
  assigned_to?: string | null;
  completion_status?: CompletionStatus;
  order_index?: number;
}

// Form state interfaces
export interface PriorityFormData {
  title: string;
  outcome: string;
  activities: string;
  assigned_to: string | null;
}

export interface AddPrioritiesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  teamId: string;
  onSave: () => void;
  existingPriorities?: Priority[];
}