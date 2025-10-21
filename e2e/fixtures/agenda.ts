import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';
import type { TestUser } from './users';
import type { TestRecurringMeeting } from './meetings';

const supabase = createClient<Database>(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RZklsT8x3NUZFmH5coV_8R_M9WvUmQA5OiVJE',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export interface TestAgendaItem {
  id: string;
  series_id: string;
  title: string;
  description?: string;
  time_minutes?: number;
  order_index: number;
  created_by: string;
  assigned_to?: string;
}

export const testAgendaItems = {
  openingComments: {
    title: 'Opening Comments',
    time_minutes: 5,
    order_index: 0,
  },
  priorities: {
    title: 'Review Priorities',
    time_minutes: 15,
    order_index: 1,
  },
  topics: {
    title: 'Team Topics',
    time_minutes: 30,
    order_index: 2,
  },
  actionItems: {
    title: 'Action Items',
    time_minutes: 10,
    order_index: 3,
  },
};

export async function createTestAgendaItem(
  seriesId: string,
  createdBy: string,
  title: string,
  orderIndex: number,
  options: {
    description?: string;
    timeMinutes?: number;
    assignedTo?: string;
  } = {}
): Promise<TestAgendaItem> {
  const { data, error } = await supabase
    .from('meeting_series_agenda')
    .insert({
      series_id: seriesId,
      title,
      description: options.description,
      time_minutes: options.timeMinutes,
      order_index: orderIndex,
      created_by: createdBy,
      assigned_to: options.assignedTo,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTestAgendaItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('meeting_series_agenda')
    .delete()
    .eq('id', itemId);

  if (error) throw error;
}

export async function createTestAgenda(
  series: TestRecurringMeeting,
  admin: TestUser
): Promise<{
  openingComments: TestAgendaItem;
  priorities: TestAgendaItem;
  topics: TestAgendaItem;
  actionItems: TestAgendaItem;
}> {
  const openingComments = await createTestAgendaItem(
    series.id,
    admin.id,
    testAgendaItems.openingComments.title,
    testAgendaItems.openingComments.order_index,
    {
      timeMinutes: testAgendaItems.openingComments.time_minutes,
      assignedTo: admin.id,
    }
  );

  const priorities = await createTestAgendaItem(
    series.id,
    admin.id,
    testAgendaItems.priorities.title,
    testAgendaItems.priorities.order_index,
    {
      timeMinutes: testAgendaItems.priorities.time_minutes,
    }
  );

  const topics = await createTestAgendaItem(
    series.id,
    admin.id,
    testAgendaItems.topics.title,
    testAgendaItems.topics.order_index,
    {
      timeMinutes: testAgendaItems.topics.time_minutes,
    }
  );

  const actionItems = await createTestAgendaItem(
    series.id,
    admin.id,
    testAgendaItems.actionItems.title,
    testAgendaItems.actionItems.order_index,
    {
      timeMinutes: testAgendaItems.actionItems.time_minutes,
    }
  );

  return {
    openingComments,
    priorities,
    topics,
    actionItems,
  };
}

export async function deleteTestAgenda(agenda: {
  openingComments?: TestAgendaItem;
  priorities?: TestAgendaItem;
  topics?: TestAgendaItem;
  actionItems?: TestAgendaItem;
}): Promise<void> {
  if (agenda.openingComments) await deleteTestAgendaItem(agenda.openingComments.id);
  if (agenda.priorities) await deleteTestAgendaItem(agenda.priorities.id);
  if (agenda.topics) await deleteTestAgendaItem(agenda.topics.id);
  if (agenda.actionItems) await deleteTestAgendaItem(agenda.actionItems.id);
}
