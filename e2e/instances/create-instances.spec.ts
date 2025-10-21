import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser } from '../helpers/auth.helper';
import { createTeam, deleteTeam } from '../helpers/team.helper';
import { createRecurringMeeting, deleteRecurringMeeting, createWeeklyMeeting } from '../helpers/meeting.helper';

test.describe('Meeting Instances - Create', () => {
  let userId: string;
  let teamId: string;
  let seriesId: string;

  test.beforeEach(async () => {
    // Create test user
    const userEmail = generateTestEmail('instances-create');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    userId = user.id;

    // Create team
    const team = await createTeam(userId, 'Instances Create Team');
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

  test('should create weekly meeting instance', async () => {
    // Create instance
    const instance = await createWeeklyMeeting(teamId, seriesId, '2025-01-06');

    // Verify instance
    expect(instance.team_id).toBe(teamId);
    expect(instance.recurring_meeting_id).toBe(seriesId);
    expect(instance.start_date).toBe('2025-01-06');
  });

  test('should create multiple instances', async () => {
    // Create instances
    const instance1 = await createWeeklyMeeting(teamId, seriesId, '2025-01-06');
    const instance2 = await createWeeklyMeeting(teamId, seriesId, '2025-01-13');
    const instance3 = await createWeeklyMeeting(teamId, seriesId, '2025-01-20');

    // Verify instances
    expect(instance1.start_date).toBe('2025-01-06');
    expect(instance2.start_date).toBe('2025-01-13');
    expect(instance3.start_date).toBe('2025-01-20');
  });

  test('should handle concurrent instance creation', async () => {
    // Create instances concurrently
    const [instance1, instance2] = await Promise.all([
      createWeeklyMeeting(teamId, seriesId, '2025-01-06'),
      createWeeklyMeeting(teamId, seriesId, '2025-01-13'),
    ]);

    // Verify instances
    expect(instance1.start_date).toBe('2025-01-06');
    expect(instance2.start_date).toBe('2025-01-13');
  });

  test('should reject duplicate instances', async () => {
    // Create first instance
    await createWeeklyMeeting(teamId, seriesId, '2025-01-06');

    // Try to create duplicate instance
    try {
      await createWeeklyMeeting(teamId, seriesId, '2025-01-06');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });

  test('should reject invalid dates', async () => {
    // Try to create instance with invalid date
    try {
      await createWeeklyMeeting(teamId, seriesId, 'invalid-date');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });
});