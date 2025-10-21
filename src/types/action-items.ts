import { Profile } from "./meeting";
import { CompletionStatus } from "./priorities";

export interface ActionItem {
  id: string;
  series_id: string;
  title: string;
  notes?: string | null;
  assigned_to?: string | null;
  due_date?: string | null;
  completion_status: CompletionStatus;
  order_index: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  assigned_to_profile?: Profile | null;
}

export interface ActionItemInsert {
  series_id: string;
  title: string;
  notes?: string | null;
  assigned_to?: string | null;
  due_date?: string | null;
  completion_status?: CompletionStatus;
  order_index: number;
  created_by: string;
}

export interface ActionItemUpdate {
  title?: string;
  notes?: string | null;
  assigned_to?: string | null;
  due_date?: string | null;
  completion_status?: CompletionStatus;
  order_index?: number;
}

// Form state interfaces
export interface ActionItemFormData {
  title: string;
  notes: string;
  assigned_to: string | null;
  due_date?: string | null;
}
