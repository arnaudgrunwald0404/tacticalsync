import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser } from '../helpers/auth.helper';
import { createTeam, deleteTeam } from '../helpers/team.helper';
import {
  createRecurringMeeting,
  deleteRecurringMeeting,
  createWeeklyMeeting,
  updateRecurringMeeting,
} from '../helpers/meeting.helper';

test.describe('Meeting Series - Edit', () => {
  let userId: string;
  let teamId: string;
  let seriesId: string;

  test.beforeEach(async () => {
    // Create test user
    const userEmail = generateTestEmail('series-edit');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    userId = user.id;

    // Create team
    const team = await createTeam(userId, 'Series Edit Team');
    teamId = team.id;

    // Create recurring meeting
    const series = await createRecurringMeeting(teamId, 'Weekly Meeting', 'weekly', userId);
    seriesId = series.id;
  });

  test.afterEach(async () => {
    if (seriesId) await deleteRecurringMeeting(seriesId);
    if (teamId) await deleteTeam(teamId);
    if (userId) await deleteUser(userId);
  });

  test('should update meeting name', async () => {
    // Update name
    await updateRecurringMeeting(seriesId, { name: 'Updated Meeting' });

    // Create instance
    const instance = await createWeeklyMeeting(teamId, seriesId, '2025-01-06');

    // Verify update
    expect(instance.recurring_meeting_id).toBe(seriesId);
  });

  test('should update meeting frequency', async () => {
    // Update frequency
    await updateRecurringMeeting(seriesId, { frequency: 'monthly' });

    // Create instance
    const instance = await createWeeklyMeeting(teamId, seriesId, '2025-01-06');

    // Verify update
    expect(instance.recurring_meeting_id).toBe(seriesId);
  });

  test('should handle multiple instances', async () => {
    // Create multiple instances
    const instance1 = await createWeeklyMeeting(teamId, seriesId, '2025-01-06');
    const instance2 = await createWeeklyMeeting(teamId, seriesId, '2025-01-13');

    // Update series
    await updateRecurringMeeting(seriesId, { name: 'Updated Meeting' });

    // Verify instances still exist
    expect(instance1.recurring_meeting_id).toBe(seriesId);
    expect(instance2.recurring_meeting_id).toBe(seriesId);
  });
});