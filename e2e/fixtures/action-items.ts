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

export interface TestActionItem {
  id: string;
  series_id: string;
  title: string;
  notes?: string;
  due_date?: string;
  order_index: number;
  created_by: string;
  assigned_to?: string;
  completion_status: 'completed' | 'not_completed';
}

export const testActionItems = {
  first: {
    title: 'Update Documentation',
    notes: 'Add new API endpoints',
    due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    order_index: 0,
  },
  second: {
    title: 'Review Pull Requests',
    notes: 'Review and merge pending PRs',
    due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    order_index: 1,
  },
};

export async function createTestActionItem(
  seriesId: string,
  createdBy: string,
  title: string,
  orderIndex: number,
  options: {
    notes?: string;
    dueDate?: string;
    assignedTo?: string;
    completionStatus?: 'completed' | 'not_completed';
  } = {}
): Promise<TestActionItem> {
  const { data, error } = await supabase
    .from('meeting_series_action_items')
    .insert({
      series_id: seriesId,
      title,
      notes: options.notes,
      due_date: options.dueDate,
      order_index: orderIndex,
      created_by: createdBy,
      assigned_to: options.assignedTo,
      completion_status: options.completionStatus || 'not_completed',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTestActionItem(actionItemId: string): Promise<void> {
  const { error } = await supabase
    .from('meeting_series_action_items')
    .delete()
    .eq('id', actionItemId);

  if (error) throw error;
}

export async function createTestActionItems(
  series: TestRecurringMeeting,
  admin: TestUser
): Promise<{
  first: TestActionItem;
  second: TestActionItem;
}> {
  const first = await createTestActionItem(
    series.id,
    admin.id,
    testActionItems.first.title,
    testActionItems.first.order_index,
    {
      notes: testActionItems.first.notes,
      dueDate: testActionItems.first.due_date,
      assignedTo: admin.id,
    }
  );

  const second = await createTestActionItem(
    series.id,
    admin.id,
    testActionItems.second.title,
    testActionItems.second.order_index,
    {
      notes: testActionItems.second.notes,
      dueDate: testActionItems.second.due_date,
    }
  );

  return { first, second };
}

export async function deleteTestActionItems(actionItems: {
  first?: TestActionItem;
  second?: TestActionItem;
}): Promise<void> {
  if (actionItems.first) await deleteTestActionItem(actionItems.first.id);
  if (actionItems.second) await deleteTestActionItem(actionItems.second.id);
}
