import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser } from '../helpers/auth.helper';
import { createTeam, deleteTeam } from '../helpers/team.helper';
import { createRecurringMeeting, createWeeklyMeeting, deleteRecurringMeeting } from '../helpers/meeting.helper';
import { createMeetingItem, updateMeetingItem, deleteMeetingItem } from '../helpers/agenda.helper';

test.describe('Priorities', () => {
  let userId: string;
  let teamId: string;
  let seriesId: string;
  let instanceId: string;

  test.beforeEach(async ({ page }) => {
    // Create test user
    const userEmail = generateTestEmail('priorities');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    userId = user.id;

    // Create team
    const team = await createTeam(userId, 'Test Team');
    teamId = team.id;
    
    // Create recurring meeting
    const series = await createRecurringMeeting(teamId, 'Weekly Meeting', 'weekly', userId);
    seriesId = series.id;

    // Create meeting instance
    const instance = await createWeeklyMeeting(teamId, seriesId, '2025-01-06');
    instanceId = instance.id;

    // Create agenda item (required for priorities)
    await createMeetingItem(
      instanceId,
      'Test Agenda Item',
      'agenda',
      userId,
      0,
      { timeMinutes: 15 }
    );

    // Log in
    await page.goto('/auth/sign-in');
    await page.fill('input[type="email"]', userEmail);
    await page.fill('input[type="password"]', 'Test123456!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test.afterEach(async () => {
    if (seriesId) await deleteRecurringMeeting(seriesId);
    if (teamId) await deleteTeam(teamId);
    if (userId) await deleteUser(userId);
  });

  test('should create a new priority', async ({ page }) => {
    await page.goto(`/team/${teamId}/meeting/${instanceId}`);

    // Click the "Add Priorities" button
    await page.getByRole('button', { name: /Add Priorities/i }).click();

    // Fill in the priority details
    await page.getByPlaceholder('Priority title').fill('Test Priority');
    await page.getByRole('button', { name: /Who\?/i }).click();
    await page.getByRole('option', { name: /Test User/i }).click();
    await page.getByPlaceholder('Notes (optional)').fill('Test notes');

    // Click the add button
    await page.getByRole('button', { name: '+' }).click();

    // Verify the priority was added
    await expect(page.getByText('Test Priority')).toBeVisible();
    await expect(page.getByText('Test notes')).toBeVisible();
  });

  test('should edit an existing priority', async ({ page }) => {
    // Create a priority via API
    const priority = await createMeetingItem(
      instanceId,
      'Initial Priority',
      'priority',
      userId,
      0,
      { description: 'Initial notes' }
    );

    await page.goto(`/team/${teamId}/meeting/${instanceId}`);

    // Verify initial state
    await expect(page.getByText('Initial Priority')).toBeVisible();
    await expect(page.getByText('Initial notes')).toBeVisible();

    // Edit the priority
    const notesEditor = page.locator('rich-text-editor').filter({ hasText: 'Initial notes' });
    await notesEditor.click();
    await notesEditor.fill('Updated notes');

    // Toggle completion
    await page.getByRole('checkbox').click();

    // Verify changes
    await expect(page.getByText('Updated notes')).toBeVisible();
    await expect(page.getByRole('checkbox')).toBeChecked();

    // Delete the priority
    await deleteMeetingItem(priority.id);
  });

  test('should reorder priorities using drag and drop', async ({ page }) => {
    // Create multiple priorities via API
    const priority1 = await createMeetingItem(
      instanceId,
      'First Priority',
      'priority',
      userId,
      0
    );

    const priority2 = await createMeetingItem(
      instanceId,
      'Second Priority',
      'priority',
      userId,
      1
    );

    await page.goto(`/team/${teamId}/meeting/${instanceId}`);

    // Get the drag handles
    const firstPriorityHandle = page.locator('.cursor-grab').first();
    const secondPriorityHandle = page.locator('.cursor-grab').nth(1);

    // Perform drag and drop
    await firstPriorityHandle.dragTo(secondPriorityHandle);

    // Verify order in UI
    const priorities = await page.locator('.font-medium').allTextContents();
    expect(priorities[0]).toBe('Second Priority');
    expect(priorities[1]).toBe('First Priority');

    // Clean up
    await deleteMeetingItem(priority1.id);
    await deleteMeetingItem(priority2.id);
  });

  test('should delete a priority', async ({ page }) => {
    // Create a priority via API
    const priority = await createMeetingItem(
      instanceId,
      'Priority to Delete',
      'priority',
      userId,
      0,
      { description: 'Some notes' }
    );

    await page.goto(`/team/${teamId}/meeting/${instanceId}`);

    // Verify priority exists
    await expect(page.getByText('Priority to Delete')).toBeVisible();

    // Delete the priority
    await page.getByRole('button', { name: 'Delete' }).click();

    // Verify priority was deleted
    await expect(page.getByText('Priority to Delete')).not.toBeVisible();
    await expect(page.getByText('No priorities yet')).toBeVisible();
  });

  test('should handle validation and errors', async ({ page }) => {
    await page.goto(`/team/${teamId}/meeting/${instanceId}`);

    // Try to add empty priority
    await page.getByRole('button', { name: /Add Priorities/i }).click();
    await page.getByRole('button', { name: '+' }).click();
    
    // Verify add button is disabled
    await expect(page.getByRole('button', { name: '+' })).toBeDisabled();

    // Fill title and verify button is enabled
    await page.getByPlaceholder('Priority title').fill('Test Priority');
    await expect(page.getByRole('button', { name: '+' })).toBeEnabled();

    // Test error handling (simulate error by temporarily disconnecting)
    await page.route('**/rest/v1/meeting_instance_priorities**', route => route.abort());
    await page.getByRole('button', { name: '+' }).click();
    await expect(page.getByText('Failed to add priority')).toBeVisible();
  });

  test('should require agenda items before adding priorities', async ({ page }) => {
    // Remove agenda items
    await deleteMeetingItem(instanceId);
    
    await page.goto(`/team/${teamId}/meeting/${instanceId}`);

    // Verify message about requiring agenda
    await expect(page.getByText('Priorities can be added once the agenda for the meeting has been set.')).toBeVisible();

    // Verify Add Priorities button is not visible
    await expect(page.getByRole('button', { name: /Add Priorities/i })).not.toBeVisible();
  });
});