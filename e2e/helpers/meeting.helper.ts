import { Page } from '@playwright/test';
import { supabaseAdmin } from './supabase.helper';
import { testMeetings, type TestRecurringMeeting, type TestMeetingInstance } from '../fixtures/meetings';
import type { TestTeam } from '../fixtures/teams';
import type { TestUser } from '../fixtures/users';

export { testMeetings, type TestRecurringMeeting, type TestMeetingInstance } from '../fixtures/meetings';

export async function createRecurringMeeting(
  teamId: string,
  name: string = testMeetings.weekly.name,
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarter' = testMeetings.weekly.frequency,
  createdBy?: string
): Promise<TestRecurringMeeting> {
  const { data, error } = await supabaseAdmin
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

export async function createWeeklyMeeting(
  teamId: string,
  seriesId: string,
  startDate: string = new Date().toISOString().split('T')[0]
): Promise<TestMeetingInstance> {
  const { data, error } = await supabaseAdmin
    .from('meeting_instances')
    .insert({
      team_id: teamId,
      recurring_meeting_id: seriesId,
      start_date: startDate,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteRecurringMeeting(seriesId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('recurring_meetings')
    .delete()
    .eq('id', seriesId);

  if (error) throw error;
}

export async function deleteMeetingInstance(instanceId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('meeting_instances')
    .delete()
    .eq('id', instanceId);

  if (error) throw error;
}

export async function getTeamRecurringMeetings(teamId: string): Promise<TestRecurringMeeting[]> {
  const { data, error } = await supabaseAdmin
    .from('recurring_meetings')
    .select()
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getRecurringMeeting(seriesId: string): Promise<TestRecurringMeeting> {
  const { data, error } = await supabaseAdmin
    .from('recurring_meetings')
    .select()
    .eq('id', seriesId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateRecurringMeeting(
  seriesId: string,
  updates: {
    name?: string;
    frequency?: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarter';
  }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('recurring_meetings')
    .update(updates)
    .eq('id', seriesId);

  if (error) throw error;
}

export async function navigateToMeeting(
  page: Page,
  teamId: string,
  instanceId: string
): Promise<void> {
  await page.goto(`/team/${teamId}/meeting/${instanceId}`);
  await page.waitForSelector('text=Meeting');
}

export async function setupTestMeeting(
  team: TestTeam,
  admin: TestUser,
  options: {
    name?: string;
    frequency?: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarter';
    startDate?: string;
  } = {}
): Promise<{
  series: TestRecurringMeeting;
  instance: TestMeetingInstance;
}> {
  // Create recurring meeting
  const series = await createRecurringMeeting(
    team.id,
    options.name || testMeetings.weekly.name,
    options.frequency || testMeetings.weekly.frequency,
    admin.id
  );

  // Create meeting instance
  const instance = await createWeeklyMeeting(
    team.id,
    series.id,
    options.startDate || new Date().toISOString().split('T')[0]
  );

  return { series, instance };
}

export async function cleanupTestMeeting(
  series: TestRecurringMeeting,
  instance: TestMeetingInstance
): Promise<void> {
  await deleteMeetingInstance(instance.id);
  await deleteRecurringMeeting(series.id);
}