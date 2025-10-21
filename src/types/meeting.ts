export type CompletionStatus = 'completed' | 'not_completed';

export interface MeetingSeriesAgenda {
  id: string;
  series_id: string;
  title: string;
  notes?: string;
  assigned_to?: string;
  time_minutes: number;
  order_index: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingInstancePriority {
  id: string;
  instance_id: string;
  title: string;
  outcome: string;
  activities: string;
  assigned_to?: string;
  order_index: number;
  completion_status: CompletionStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingInstanceTopic {
  id: string;
  instance_id: string;
  title: string;
  notes?: string;
  assigned_to?: string;
  time_minutes: number;
  order_index: number;
  completion_status: CompletionStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingSeriesActionItem {
  id: string;
  series_id: string;
  title: string;
  notes?: string;
  assigned_to?: string;
  due_date?: string;
  order_index: number;
  completion_status: CompletionStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}