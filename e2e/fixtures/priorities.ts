import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';
import type { TestUser } from './users';
import type { TestMeetingInstance } from './meetings';

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

export interface TestPriority {
  id: string;
  instance_id: string;
  title: string;
  outcome?: string;
  activities?: string;
  order_index: number;
  created_by: string;
  assigned_to?: string;
  completion_status: 'completed' | 'not_completed';
}

export const testPriorities = {
  first: {
    title: 'Launch New Feature',
    outcome: 'Feature is live and stable',
    activities: 'Deploy, monitor, fix bugs',
    order_index: 0,
  },
  second: {
    title: 'Improve Performance',
    outcome: 'Response time under 200ms',
    activities: 'Optimize queries, add caching',
    order_index: 1,
  },
};

export async function createTestPriority(
  instanceId: string,
  createdBy: string,
  title: string,
  orderIndex: number,
  options: {
    outcome?: string;
    activities?: string;
    assignedTo?: string;
    completionStatus?: 'completed' | 'not_completed';
  } = {}
): Promise<TestPriority> {
  const { data, error } = await supabase
    .from('meeting_instance_priorities')
    .insert({
      instance_id: instanceId,
      title,
      outcome: options.outcome,
      activities: options.activities,
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

export async function deleteTestPriority(priorityId: string): Promise<void> {
  const { error } = await supabase
    .from('meeting_instance_priorities')
    .delete()
    .eq('id', priorityId);

  if (error) throw error;
}

export async function createTestPriorities(
  instance: TestMeetingInstance,
  admin: TestUser
): Promise<{
  first: TestPriority;
  second: TestPriority;
}> {
  const first = await createTestPriority(
    instance.id,
    admin.id,
    testPriorities.first.title,
    testPriorities.first.order_index,
    {
      outcome: testPriorities.first.outcome,
      activities: testPriorities.first.activities,
      assignedTo: admin.id,
    }
  );

  const second = await createTestPriority(
    instance.id,
    admin.id,
    testPriorities.second.title,
    testPriorities.second.order_index,
    {
      outcome: testPriorities.second.outcome,
      activities: testPriorities.second.activities,
    }
  );

  return { first, second };
}

export async function deleteTestPriorities(priorities: {
  first?: TestPriority;
  second?: TestPriority;
}): Promise<void> {
  if (priorities.first) await deleteTestPriority(priorities.first.id);
  if (priorities.second) await deleteTestPriority(priorities.second.id);
}
