import { Page, expect } from '@playwright/test';
import { supabase } from './supabase.helper';

export interface TestRecurringMeeting {
  id: string;
  name: string;
  team_id: string;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  created_by: string;
}

export interface TestWeeklyMeeting {
  id: string;
  team_id: string;
  recurring_meeting_id: string;
  week_start_date: string;
}

/**
 * Create a recurring meeting series via API
 */
export async function createRecurringMeeting(
  teamId: string,
  name: string,
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly',
  createdBy: string
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

/**
 * Get recurring meeting by ID
 */
export async function getRecurringMeeting(id: string): Promise<TestRecurringMeeting | null> {
  const { data, error } = await supabase
    .from('recurring_meetings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

/**
 * Get all recurring meetings for a team
 */
export async function getTeamRecurringMeetings(teamId: string): Promise<TestRecurringMeeting[]> {
  const { data, error } = await supabase
    .from('recurring_meetings')
    .select('*')
    .eq('team_id', teamId);

  if (error) throw error;
  return data || [];
}

/**
 * Update recurring meeting
 */
export async function updateRecurringMeeting(
  id: string,
  updates: Partial<TestRecurringMeeting>
): Promise<void> {
  const { error } = await supabase
    .from('recurring_meetings')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

/**
 * Delete recurring meeting
 */
export async function deleteRecurringMeeting(id: string): Promise<void> {
  try {
    // Delete related weekly meetings first
    await supabase
      .from('weekly_meetings')
      .delete()
      .eq('recurring_meeting_id', id);

    // Delete the recurring meeting
    await supabase
      .from('recurring_meetings')
      .delete()
      .eq('id', id);
  } catch (error) {
    console.warn(`Failed to delete recurring meeting ${id}:`, error);
  }
}

/**
 * Create a weekly meeting instance
 */
export async function createWeeklyMeeting(
  teamId: string,
  recurringMeetingId: string,
  weekStartDate: string
): Promise<TestWeeklyMeeting> {
  const { data, error } = await supabase
    .from('weekly_meetings')
    .insert({
      team_id: teamId,
      recurring_meeting_id: recurringMeetingId,
      week_start_date: weekStartDate,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get weekly meetings for a recurring meeting
 */
export async function getWeeklyMeetings(recurringMeetingId: string): Promise<TestWeeklyMeeting[]> {
  const { data, error } = await supabase
    .from('weekly_meetings')
    .select('*')
    .eq('recurring_meeting_id', recurringMeetingId)
    .order('week_start_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get weekly meeting by date
 */
export async function getWeeklyMeetingByDate(
  recurringMeetingId: string,
  weekStartDate: string
): Promise<TestWeeklyMeeting | null> {
  const { data, error } = await supabase
    .from('weekly_meetings')
    .select('*')
    .eq('recurring_meeting_id', recurringMeetingId)
    .eq('week_start_date', weekStartDate)
    .single();

  if (error) return null;
  return data;
}

/**
 * Delete weekly meeting
 */
export async function deleteWeeklyMeeting(id: string): Promise<void> {
  const { error } = await supabase
    .from('weekly_meetings')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Navigate to meeting series page
 */
export async function navigateToMeetingSeries(
  page: Page,
  teamId: string
): Promise<void> {
  await page.goto(`/team/${teamId}/meetings`);
}

/**
 * Navigate to specific meeting instance
 */
export async function navigateToWeeklyMeeting(
  page: Page,
  teamId: string,
  meetingId: string
): Promise<void> {
  await page.goto(`/team/${teamId}/meeting/${meetingId}`);
}

/**
 * Navigate to meeting settings
 */
export async function navigateToMeetingSettings(
  page: Page,
  teamId: string,
  recurringMeetingId: string
): Promise<void> {
  await page.goto(`/team/${teamId}/meeting/${recurringMeetingId}/settings`);
}

