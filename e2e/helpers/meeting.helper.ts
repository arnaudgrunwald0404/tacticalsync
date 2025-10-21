import { testClient as supabase } from './test-client';

export interface TestUser {
  id: string;
  email: string;
}

export interface TestTeam {
  id: string;
  name: string;
  abbreviated_name: string;
}

export interface TestRecurringMeeting {
  id: string;
  team_id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarter';
}

export interface TestMeetingInstance {
  id: string;
  team_id: string;
  recurring_meeting_id: string;
  start_date: string;
}

export async function createTestUser(): Promise<TestUser> {
  const email = `test-${Date.now()}@example.com`;
  const { data: { user }, error } = await supabase.auth.signUp({
    email,
    password: 'testpassword123',
  });
  if (error) throw error;
  return { id: user!.id, email };
}

export async function createTestTeam(name?: string): Promise<TestTeam> {
  const { data, error } = await supabase
    .from('teams')
    .insert({
      name: name || `Test Team ${Date.now()}`,
      abbreviated_name: 'TEST',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addTeamMember(teamId: string, userId: string, role: 'admin' | 'member' = 'member') {
  const { error } = await supabase
    .from('team_members')
    .insert({
      team_id: teamId,
      user_id: userId,
      role,
    });
  if (error) throw error;
}

export async function createRecurringMeeting(
  teamId: string,
  name: string = 'Weekly Tactical',
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarter' = 'weekly'
): Promise<TestRecurringMeeting> {
  const { data, error } = await supabase
    .from('recurring_meetings')
    .insert({
      team_id: teamId,
      name,
      frequency,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createMeetingInstance(
  teamId: string,
  recurringMeetingId: string,
  startDate?: string
): Promise<TestMeetingInstance> {
  const date = startDate || new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('meeting_instances')
    .insert({
      team_id: teamId,
      recurring_meeting_id: recurringMeetingId,
      start_date: date,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function cleanupTestData(
  userId?: string,
  teamId?: string,
  recurringMeetingId?: string,
  meetingInstanceId?: string
) {
  if (meetingInstanceId) {
    await supabase
      .from('meeting_instances')
      .delete()
      .eq('id', meetingInstanceId);
  }

  if (recurringMeetingId) {
    await supabase
      .from('recurring_meetings')
      .delete()
      .eq('id', recurringMeetingId);
  }

  if (teamId) {
    await supabase
      .from('teams')
      .delete()
      .eq('id', teamId);
  }

  if (userId) {
    await supabase.auth.admin.deleteUser(userId);
  }
}

export async function verifyAgendaItem(page: any, title: string, duration?: number) {
  await expect(page.locator(`text="${title}"`)).toBeVisible();
  if (duration) {
    await expect(page.locator(`text="${duration} min"`)).toBeVisible();
  }
}

export async function verifyPriority(page: any, title: string) {
  await expect(page.locator(`text="${title}"`)).toBeVisible();
}

export async function verifyTopic(page: any, title: string, duration?: number) {
  await expect(page.locator(`text="${title}"`)).toBeVisible();
  if (duration) {
    await expect(page.locator(`text="${duration} min"`)).toBeVisible();
  }
}

export async function verifyActionItem(page: any, title: string) {
  await expect(page.locator(`text="${title}"`)).toBeVisible();
}