import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser } from '../helpers/auth.helper';
import { createTeam, deleteTeam } from '../helpers/team.helper';
import { createMeetingItem, getMeetingItems } from '../helpers/agenda.helper';
import { createRecurringMeeting, deleteRecurringMeeting } from '../helpers/meeting.helper';

test.describe('Agenda Template - Create', () => {
  let userId: string;
  let teamId: string;
  let seriesId: string;

  test.beforeEach(async () => {
    // Create test user
    const userEmail = generateTestEmail('template-create');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    userId = user.id;

    // Create team
    const team = await createTeam(userId, 'Template Create Team');
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

  test('should create template with multiple items', async () => {
    // Create agenda items
    await createMeetingItem(seriesId, 'Good News', 'agenda', userId, 0, { timeMinutes: 5 });
    await createMeetingItem(seriesId, 'Scorecard Review', 'agenda', userId, 1, { timeMinutes: 10 });
    await createMeetingItem(seriesId, 'Rock Review', 'agenda', userId, 2, { timeMinutes: 15 });

    // Verify items
    const items = await getMeetingItems(seriesId, 'agenda');
    expect(items.length).toBe(3);
    expect(items[0].title).toBe('Good News');
    expect(items[1].title).toBe('Scorecard Review');
    expect(items[2].title).toBe('Rock Review');
  });

  test('should create template with varying durations', async () => {
    // Create agenda items
    await createMeetingItem(seriesId, 'Quick Update', 'agenda', userId, 0, { timeMinutes: 5 });
    await createMeetingItem(seriesId, 'Deep Dive', 'agenda', userId, 1, { timeMinutes: 30 });

    // Verify items
    const items = await getMeetingItems(seriesId, 'agenda');
    expect(items.length).toBe(2);
    expect(items[0].time_minutes).toBe(5);
    expect(items[1].time_minutes).toBe(30);
  });

  test('should maintain item order', async () => {
    // Create agenda items in specific order
    await createMeetingItem(seriesId, 'Third Item', 'agenda', userId, 2, { timeMinutes: 5 });
    await createMeetingItem(seriesId, 'First Item', 'agenda', userId, 0, { timeMinutes: 5 });
    await createMeetingItem(seriesId, 'Second Item', 'agenda', userId, 1, { timeMinutes: 5 });

    // Verify order
    const items = await getMeetingItems(seriesId, 'agenda');
    expect(items.length).toBe(3);
    expect(items[0].title).toBe('First Item');
    expect(items[1].title).toBe('Second Item');
    expect(items[2].title).toBe('Third Item');
  });
});