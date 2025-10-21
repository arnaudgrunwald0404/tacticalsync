import { supabase } from './supabase.helper';

export interface TestRecurringMeeting {
  id: string;
  team_id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarter';
  created_by?: string;
}

export interface TestMeetingInstance {
  id: string;
  team_id: string;
  recurring_meeting_id: string;
  start_date: string;
}

export async function createRecurringMeeting(
  teamId: string,
  name: string = 'Weekly Tactical',
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarter' = 'weekly',
  createdBy?: string
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

export async function createWeeklyMeeting(
  teamId: string,
  seriesId: string,
  startDate: string
): Promise<TestMeetingInstance> {
  const { data, error } = await supabase
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
  const { error } = await supabase
    .from('recurring_meetings')
    .delete()
    .eq('id', seriesId);
  if (error) throw error;
}

export async function getWeeklyMeetings(seriesId: string): Promise<TestMeetingInstance[]> {
  const { data, error } = await supabase
    .from('meeting_instances')
    .select()
    .eq('recurring_meeting_id', seriesId)
    .order('start_date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getTeamRecurringMeetings(teamId: string): Promise<TestRecurringMeeting[]> {
  const { data, error } = await supabase
    .from('recurring_meetings')
    .select()
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getRecurringMeeting(seriesId: string): Promise<TestRecurringMeeting> {
  const { data, error } = await supabase
    .from('recurring_meetings')
    .select()
    .eq('id', seriesId)
    .single();
  if (error) throw error;
  return data;
}