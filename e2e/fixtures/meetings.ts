import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';
import type { TestTeam } from './teams';
import type { TestUser } from './users';

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

export interface TestRecurringMeeting {
  id: string;
  team_id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarter';
  created_by: string;
}

export interface TestMeetingInstance {
  id: string;
  team_id: string;
  recurring_meeting_id: string;
  start_date: string;
}

export const testMeetings = {
  weekly: {
    name: 'Weekly Tactical',
    frequency: 'weekly' as const,
  },
  monthly: {
    name: 'Monthly Strategic',
    frequency: 'monthly' as const,
  },
};

export async function createTestRecurringMeeting(
  teamId: string,
  createdBy: string,
  name: string = testMeetings.weekly.name,
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarter' = testMeetings.weekly.frequency
): Promise<TestRecurringMeeting> {
  const { data, error } = await supabase
    .from('recurring_meetings')
    .insert({
      team_id: teamId,
      name,
      frequency,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createTestMeetingInstance(
  teamId: string,
  recurringMeetingId: string,
  startDate: string = new Date().toISOString().split('T')[0]
): Promise<TestMeetingInstance> {
  const { data, error } = await supabase
    .from('meeting_instances')
    .insert({
      team_id: teamId,
      recurring_meeting_id: recurringMeetingId,
      start_date: startDate,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTestRecurringMeeting(meetingId: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_meetings')
    .delete()
    .eq('id', meetingId);

  if (error) throw error;
}

export async function deleteTestMeetingInstance(instanceId: string): Promise<void> {
  const { error } = await supabase
    .from('meeting_instances')
    .delete()
    .eq('id', instanceId);

  if (error) throw error;
}

export async function createTestMeetings(
  team: TestTeam,
  admin: TestUser
): Promise<{
  weekly: {
    series: TestRecurringMeeting;
    instance: TestMeetingInstance;
  };
  monthly: {
    series: TestRecurringMeeting;
    instance: TestMeetingInstance;
  };
}> {
  // Create weekly meeting
  const weeklySeries = await createTestRecurringMeeting(
    team.id,
    admin.id,
    testMeetings.weekly.name,
    testMeetings.weekly.frequency
  );

  const weeklyInstance = await createTestMeetingInstance(
    team.id,
    weeklySeries.id,
    new Date().toISOString().split('T')[0]
  );

  // Create monthly meeting
  const monthlySeries = await createTestRecurringMeeting(
    team.id,
    admin.id,
    testMeetings.monthly.name,
    testMeetings.monthly.frequency
  );

  const monthlyInstance = await createTestMeetingInstance(
    team.id,
    monthlySeries.id,
    new Date().toISOString().split('T')[0]
  );

  return {
    weekly: {
      series: weeklySeries,
      instance: weeklyInstance,
    },
    monthly: {
      series: monthlySeries,
      instance: monthlyInstance,
    },
  };
}

export async function deleteTestMeetings(meetings: {
  weekly?: {
    series: TestRecurringMeeting;
    instance: TestMeetingInstance;
  };
  monthly?: {
    series: TestRecurringMeeting;
    instance: TestMeetingInstance;
  };
}): Promise<void> {
  if (meetings.weekly) {
    await deleteTestMeetingInstance(meetings.weekly.instance.id);
    await deleteTestRecurringMeeting(meetings.weekly.series.id);
  }

  if (meetings.monthly) {
    await deleteTestMeetingInstance(meetings.monthly.instance.id);
    await deleteTestRecurringMeeting(meetings.monthly.series.id);
  }
}
