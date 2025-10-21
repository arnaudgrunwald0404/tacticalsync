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

export interface TestTopic {
  id: string;
  instance_id: string;
  title: string;
  notes?: string;
  time_minutes?: number;
  order_index: number;
  created_by: string;
  assigned_to?: string;
  completion_status: 'completed' | 'not_completed';
}

export const testTopics = {
  first: {
    title: 'API Documentation',
    notes: 'Review and update API docs',
    time_minutes: 15,
    order_index: 0,
  },
  second: {
    title: 'Team Structure',
    notes: 'Discuss team organization',
    time_minutes: 20,
    order_index: 1,
  },
};

export async function createTestTopic(
  instanceId: string,
  createdBy: string,
  title: string,
  orderIndex: number,
  options: {
    notes?: string;
    timeMinutes?: number;
    assignedTo?: string;
    completionStatus?: 'completed' | 'not_completed';
  } = {}
): Promise<TestTopic> {
  const { data, error } = await supabase
    .from('meeting_instance_topics')
    .insert({
      instance_id: instanceId,
      title,
      notes: options.notes,
      time_minutes: options.timeMinutes,
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

export async function deleteTestTopic(topicId: string): Promise<void> {
  const { error } = await supabase
    .from('meeting_instance_topics')
    .delete()
    .eq('id', topicId);

  if (error) throw error;
}

export async function createTestTopics(
  instance: TestMeetingInstance,
  admin: TestUser
): Promise<{
  first: TestTopic;
  second: TestTopic;
}> {
  const first = await createTestTopic(
    instance.id,
    admin.id,
    testTopics.first.title,
    testTopics.first.order_index,
    {
      notes: testTopics.first.notes,
      timeMinutes: testTopics.first.time_minutes,
      assignedTo: admin.id,
    }
  );

  const second = await createTestTopic(
    instance.id,
    admin.id,
    testTopics.second.title,
    testTopics.second.order_index,
    {
      notes: testTopics.second.notes,
      timeMinutes: testTopics.second.time_minutes,
    }
  );

  return { first, second };
}

export async function deleteTestTopics(topics: {
  first?: TestTopic;
  second?: TestTopic;
}): Promise<void> {
  if (topics.first) await deleteTestTopic(topics.first.id);
  if (topics.second) await deleteTestTopic(topics.second.id);
}
