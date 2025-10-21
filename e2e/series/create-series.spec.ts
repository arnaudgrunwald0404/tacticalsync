import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser } from '../helpers/auth.helper';
import { createTeam, deleteTeam } from '../helpers/team.helper';
import { createRecurringMeeting, deleteRecurringMeeting, createWeeklyMeeting } from '../helpers/meeting.helper';

test.describe('Meeting Series - Create', () => {
  let userId: string;
  let teamId: string;

  test.beforeEach(async () => {
    // Create test user
    const userEmail = generateTestEmail('series-create');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    userId = user.id;

    // Create team
    const team = await createTeam(userId, 'Series Create Team');
    teamId = team.id;
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (userId) await deleteUser(userId);
  });

  test('should create recurring meeting', async () => {
    // Create recurring meeting
    const series = await createRecurringMeeting(teamId, 'Weekly Meeting', 'weekly', userId);

    // Create meeting instance
    const instance = await createWeeklyMeeting(teamId, series.id, '2025-01-06');

    // Verify series and instance
    expect(series.name).toBe('Weekly Meeting');
    expect(series.frequency).toBe('weekly');
    expect(instance.recurring_meeting_id).toBe(series.id);
    expect(instance.start_date).toBe('2025-01-06');
  });

  test('should create meeting with different frequencies', async () => {
    // Create meetings with different frequencies
    const daily = await createRecurringMeeting(teamId, 'Daily Standup', 'daily', userId);
    const weekly = await createRecurringMeeting(teamId, 'Weekly Tactical', 'weekly', userId);
    const biWeekly = await createRecurringMeeting(teamId, 'Bi-Weekly Planning', 'bi-weekly', userId);
    const monthly = await createRecurringMeeting(teamId, 'Monthly Review', 'monthly', userId);
    const quarterly = await createRecurringMeeting(teamId, 'Quarterly Strategy', 'quarter', userId);

    // Verify frequencies
    expect(daily.frequency).toBe('daily');
    expect(weekly.frequency).toBe('weekly');
    expect(biWeekly.frequency).toBe('bi-weekly');
    expect(monthly.frequency).toBe('monthly');
    expect(quarterly.frequency).toBe('quarter');

    // Clean up
    await deleteRecurringMeeting(daily.id);
    await deleteRecurringMeeting(weekly.id);
    await deleteRecurringMeeting(biWeekly.id);
    await deleteRecurringMeeting(monthly.id);
    await deleteRecurringMeeting(quarterly.id);
  });
});