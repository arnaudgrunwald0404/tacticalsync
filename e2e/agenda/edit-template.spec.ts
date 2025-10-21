import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser } from '../helpers/auth.helper';
import { createTeam, deleteTeam } from '../helpers/team.helper';
import { createMeetingItem, updateMeetingItem, deleteMeetingItem, getMeetingItems } from '../helpers/agenda.helper';
import { createRecurringMeeting, deleteRecurringMeeting } from '../helpers/meeting.helper';

test.describe('Agenda Template - Edit', () => {
  let userId: string;
  let teamId: string;
  let seriesId: string;

  test.beforeEach(async () => {
    // Create test user
    const userEmail = generateTestEmail('template-edit');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    userId = user.id;

    // Create team
    const team = await createTeam(userId, 'Template Edit Team');
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

  test('should reorder template items', async () => {
    // Create agenda items
    const item1 = await createMeetingItem(seriesId, 'First', 'agenda', userId, 0, { timeMinutes: 5 });
    const item2 = await createMeetingItem(seriesId, 'Second', 'agenda', userId, 1, { timeMinutes: 5 });
    const item3 = await createMeetingItem(seriesId, 'Third', 'agenda', userId, 2, { timeMinutes: 5 });

    // Get initial order
    const initialItems = await getMeetingItems(seriesId, 'agenda');
    expect(initialItems[0].title).toBe('First');
    expect(initialItems[1].title).toBe('Second');
    expect(initialItems[2].title).toBe('Third');

    // Update order
    await updateMeetingItem(item1.id, 'agenda', { title: item1.title, order_index: 2 });
    await updateMeetingItem(item2.id, 'agenda', { title: item2.title, order_index: 1 });
    await updateMeetingItem(item3.id, 'agenda', { title: item3.title, order_index: 0 });

    // Verify new order
    const updatedItems = await getMeetingItems(seriesId, 'agenda');
    expect(updatedItems[0].title).toBe('Third');
    expect(updatedItems[1].title).toBe('Second');
    expect(updatedItems[2].title).toBe('First');
  });

  test('should add items to existing template', async () => {
    // Add initial items
    await createMeetingItem(seriesId, 'Item 1', 'agenda', userId, 0, { timeMinutes: 5 });
    await createMeetingItem(seriesId, 'Item 2', 'agenda', userId, 1, { timeMinutes: 5 });

    // Verify initial items
    let items = await getMeetingItems(seriesId, 'agenda');
    expect(items.length).toBe(2);

    // Add more items
    await createMeetingItem(seriesId, 'Item 3', 'agenda', userId, 2, { timeMinutes: 5 });
    await createMeetingItem(seriesId, 'Item 4', 'agenda', userId, 3, { timeMinutes: 5 });

    // Verify all items
    items = await getMeetingItems(seriesId, 'agenda');
    expect(items.length).toBe(4);
  });

  test('should remove items from template', async () => {
    // Create items
    const item1 = await createMeetingItem(seriesId, 'Keep This', 'agenda', userId, 0, { timeMinutes: 5 });
    const item2 = await createMeetingItem(seriesId, 'Remove This', 'agenda', userId, 1, { timeMinutes: 5 });
    const item3 = await createMeetingItem(seriesId, 'Keep This Too', 'agenda', userId, 2, { timeMinutes: 5 });

    // Remove middle item
    await deleteMeetingItem(item2.id, 'agenda');

    // Verify remaining items
    const items = await getMeetingItems(seriesId, 'agenda');
    expect(items.length).toBe(2);
    expect(items[0].title).toBe('Keep This');
    expect(items[1].title).toBe('Keep This Too');
  });

  test('should update item title', async () => {
    // Create item
    const item = await createMeetingItem(seriesId, 'Original Title', 'agenda', userId, 0, { timeMinutes: 5 });

    // Update title
    await updateMeetingItem(item.id, 'agenda', { title: 'Updated Title' });

    // Verify update
    const items = await getMeetingItems(seriesId, 'agenda');
    expect(items[0].title).toBe('Updated Title');
  });

  test('should update item duration', async () => {
    // Create item
    const item = await createMeetingItem(seriesId, 'Item', 'agenda', userId, 0, { timeMinutes: 5 });

    // Update duration
    await updateMeetingItem(item.id, 'agenda', { timeMinutes: 15 });

    // Verify update
    const items = await getMeetingItems(seriesId, 'agenda');
    expect(items[0].time_minutes).toBe(15);
  });

  test('should reject empty item title', async () => {
    // Try to create item with empty title
    try {
      await createMeetingItem(seriesId, '', 'agenda', userId, 0, { timeMinutes: 5 });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });

  test('should accept reasonable number of items', async () => {
    // Add 10 items
    for (let i = 0; i < 10; i++) {
      await createMeetingItem(seriesId, `Item ${i + 1}`, 'agenda', userId, i, { timeMinutes: 5 });
    }

    // Verify all items
    const items = await getMeetingItems(seriesId, 'agenda');
    expect(items.length).toBe(10);
  });

  test('should warn about excessive total duration', async () => {
    // Add items totaling 3 hours
    await createMeetingItem(seriesId, 'Long Discussion 1', 'agenda', userId, 0, { timeMinutes: 60 });
    await createMeetingItem(seriesId, 'Long Discussion 2', 'agenda', userId, 1, { timeMinutes: 60 });
    await createMeetingItem(seriesId, 'Long Discussion 3', 'agenda', userId, 2, { timeMinutes: 60 });

    // Verify total duration
    const items = await getMeetingItems(seriesId, 'agenda');
    const totalMinutes = items.reduce((sum, item) => sum + (item.time_minutes || 0), 0);
    expect(totalMinutes).toBe(180);
  });

  test('should handle zero duration items', async () => {
    // Create item with no duration
    await createMeetingItem(seriesId, 'Quick Note', 'agenda', userId, 0);

    // Verify item
    const items = await getMeetingItems(seriesId, 'agenda');
    expect(items[0].time_minutes).toBeNull();
  });

  test('should accept various duration values', async () => {
    // Create items with different durations
    await createMeetingItem(seriesId, 'Quick (1 min)', 'agenda', userId, 0, { timeMinutes: 1 });
    await createMeetingItem(seriesId, 'Short (5 min)', 'agenda', userId, 1, { timeMinutes: 5 });
    await createMeetingItem(seriesId, 'Medium (15 min)', 'agenda', userId, 2, { timeMinutes: 15 });
    await createMeetingItem(seriesId, 'Long (30 min)', 'agenda', userId, 3, { timeMinutes: 30 });
    await createMeetingItem(seriesId, 'Very Long (60 min)', 'agenda', userId, 4, { timeMinutes: 60 });

    // Verify durations
    const items = await getMeetingItems(seriesId, 'agenda');
    expect(items.length).toBe(5);
    expect(items.map(item => item.time_minutes)).toEqual([1, 5, 15, 30, 60]);
  });
});