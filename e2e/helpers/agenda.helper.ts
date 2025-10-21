import { supabase } from './supabase.helper';

export interface MeetingItem {
  id: string;
  title: string;
  description?: string;
  time_minutes?: number;
  order_index: number;
  created_by: string;
  assigned_to?: string;
  completion_status: 'completed' | 'not_completed';
}

export async function createMeetingItem(
  instanceId: string,
  title: string,
  type: 'agenda' | 'priority' | 'topic' | 'action_item',
  createdBy: string,
  orderIndex: number,
  options: {
    description?: string;
    timeMinutes?: number;
    assignedTo?: string;
  } = {}
): Promise<MeetingItem> {
  const table = type === 'agenda' ? 'meeting_series_agenda' :
                type === 'priority' ? 'meeting_instance_priorities' :
                type === 'topic' ? 'meeting_instance_topics' :
                'meeting_series_action_items';

  const { data, error } = await supabase
    .from(table)
    .insert({
      instance_id: instanceId,
      title,
      description: options.description,
      time_minutes: options.timeMinutes,
      assigned_to: options.assignedTo,
      order_index: orderIndex,
      created_by: createdBy,
      completion_status: 'not_completed',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMeetingItem(
  itemId: string,
  updates: {
    title?: string;
    description?: string;
    timeMinutes?: number;
    assignedTo?: string;
    completionStatus?: 'completed' | 'not_completed';
  }
): Promise<void> {
  const { error } = await supabase
    .from('meeting_instance_topics')
    .update({
      title: updates.title,
      description: updates.description,
      time_minutes: updates.timeMinutes,
      assigned_to: updates.assignedTo,
      completion_status: updates.completionStatus,
    })
    .eq('id', itemId);

  if (error) throw error;
}

export async function deleteMeetingItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('meeting_instance_topics')
    .delete()
    .eq('id', itemId);

  if (error) throw error;
}

export async function getMeetingItems(instanceId: string): Promise<MeetingItem[]> {
  const { data, error } = await supabase
    .from('meeting_instance_topics')
    .select()
    .eq('instance_id', instanceId)
    .order('order_index');

  if (error) throw error;
  return data;
}