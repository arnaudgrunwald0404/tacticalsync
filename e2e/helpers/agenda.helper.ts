import { Page } from '@playwright/test';
import { supabaseAdmin } from './supabase.helper';
import type { TestUser } from '../fixtures/users';
import type { TestRecurringMeeting, TestMeetingInstance } from '../fixtures/meetings';

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
    completionStatus?: 'completed' | 'not_completed';
  } = {}
): Promise<MeetingItem> {
  const table = type === 'agenda' ? 'meeting_series_agenda' :
                type === 'priority' ? 'meeting_instance_priorities' :
                type === 'topic' ? 'meeting_instance_topics' :
                'meeting_series_action_items';

  const { data, error } = await supabaseAdmin
    .from(table)
    .insert({
      [type === 'agenda' || type === 'action_item' ? 'series_id' : 'instance_id']: instanceId,
      title,
      description: options.description,
      time_minutes: options.timeMinutes,
      assigned_to: options.assignedTo,
      order_index: orderIndex,
      created_by: createdBy,
      completion_status: options.completionStatus || 'not_completed',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMeetingItem(
  itemId: string,
  type: 'agenda' | 'priority' | 'topic' | 'action_item',
  updates: {
    title?: string;
    description?: string;
    timeMinutes?: number;
    assignedTo?: string;
    completionStatus?: 'completed' | 'not_completed';
  }
): Promise<void> {
  const table = type === 'agenda' ? 'meeting_series_agenda' :
                type === 'priority' ? 'meeting_instance_priorities' :
                type === 'topic' ? 'meeting_instance_topics' :
                'meeting_series_action_items';

  const { error } = await supabaseAdmin
    .from(table)
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

export async function deleteMeetingItem(
  itemId: string,
  type: 'agenda' | 'priority' | 'topic' | 'action_item'
): Promise<void> {
  const table = type === 'agenda' ? 'meeting_series_agenda' :
                type === 'priority' ? 'meeting_instance_priorities' :
                type === 'topic' ? 'meeting_instance_topics' :
                'meeting_series_action_items';

  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq('id', itemId);

  if (error) throw error;
}

export async function getMeetingItems(
  instanceId: string,
  type: 'agenda' | 'priority' | 'topic' | 'action_item'
): Promise<MeetingItem[]> {
  const table = type === 'agenda' ? 'meeting_series_agenda' :
                type === 'priority' ? 'meeting_instance_priorities' :
                type === 'topic' ? 'meeting_instance_topics' :
                'meeting_series_action_items';

  const { data, error } = await supabaseAdmin
    .from(table)
    .select()
    .eq(type === 'agenda' || type === 'action_item' ? 'series_id' : 'instance_id', instanceId)
    .order('order_index');

  if (error) throw error;
  return data;
}

export async function reorderMeetingItems(
  type: 'agenda' | 'priority' | 'topic' | 'action_item',
  updates: { id: string; order_index: number }[]
): Promise<void> {
  const table = type === 'agenda' ? 'meeting_series_agenda' :
                type === 'priority' ? 'meeting_instance_priorities' :
                type === 'topic' ? 'meeting_instance_topics' :
                'meeting_series_action_items';

  for (const update of updates) {
    const { error } = await supabaseAdmin
      .from(table)
      .update({ order_index: update.order_index })
      .eq('id', update.id);

    if (error) throw error;
  }
}

export async function setupTestAgenda(
  series: TestRecurringMeeting,
  instance: TestMeetingInstance,
  admin: TestUser,
  options: {
    agendaItems?: { title: string; timeMinutes?: number }[];
    priorities?: { title: string; outcome?: string; activities?: string }[];
    topics?: { title: string; notes?: string; timeMinutes?: number }[];
    actionItems?: { title: string; notes?: string; dueDate?: string }[];
  } = {}
): Promise<{
  agendaItems: MeetingItem[];
  priorities: MeetingItem[];
  topics: MeetingItem[];
  actionItems: MeetingItem[];
}> {
  const result = {
    agendaItems: [] as MeetingItem[],
    priorities: [] as MeetingItem[],
    topics: [] as MeetingItem[],
    actionItems: [] as MeetingItem[],
  };

  // Create agenda items
  if (options.agendaItems) {
    for (let i = 0; i < options.agendaItems.length; i++) {
      const item = options.agendaItems[i];
      const agendaItem = await createMeetingItem(
        series.id,
        item.title,
        'agenda',
        admin.id,
        i,
        { timeMinutes: item.timeMinutes }
      );
      result.agendaItems.push(agendaItem);
    }
  }

  // Create priorities
  if (options.priorities) {
    for (let i = 0; i < options.priorities.length; i++) {
      const item = options.priorities[i];
      const priority = await createMeetingItem(
        instance.id,
        item.title,
        'priority',
        admin.id,
        i,
        {
          description: item.outcome,
          timeMinutes: undefined,
          assignedTo: admin.id,
        }
      );
      result.priorities.push(priority);
    }
  }

  // Create topics
  if (options.topics) {
    for (let i = 0; i < options.topics.length; i++) {
      const item = options.topics[i];
      const topic = await createMeetingItem(
        instance.id,
        item.title,
        'topic',
        admin.id,
        i,
        {
          description: item.notes,
          timeMinutes: item.timeMinutes,
          assignedTo: admin.id,
        }
      );
      result.topics.push(topic);
    }
  }

  // Create action items
  if (options.actionItems) {
    for (let i = 0; i < options.actionItems.length; i++) {
      const item = options.actionItems[i];
      const actionItem = await createMeetingItem(
        series.id,
        item.title,
        'action_item',
        admin.id,
        i,
        {
          description: item.notes,
          timeMinutes: undefined,
          assignedTo: admin.id,
        }
      );
      result.actionItems.push(actionItem);
    }
  }

  return result;
}

export async function cleanupTestAgenda(
  items: {
    agendaItems?: MeetingItem[];
    priorities?: MeetingItem[];
    topics?: MeetingItem[];
    actionItems?: MeetingItem[];
  }
): Promise<void> {
  // Delete agenda items
  if (items.agendaItems) {
    for (const item of items.agendaItems) {
      await deleteMeetingItem(item.id, 'agenda');
    }
  }

  // Delete priorities
  if (items.priorities) {
    for (const item of items.priorities) {
      await deleteMeetingItem(item.id, 'priority');
    }
  }

  // Delete topics
  if (items.topics) {
    for (const item of items.topics) {
      await deleteMeetingItem(item.id, 'topic');
    }
  }

  // Delete action items
  if (items.actionItems) {
    for (const item of items.actionItems) {
      await deleteMeetingItem(item.id, 'action_item');
    }
  }
}