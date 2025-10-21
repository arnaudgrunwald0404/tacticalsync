import { test, expect } from '@playwright/test';
import { loginAsTestUser } from '../helpers/auth.helper';
import { createTeam } from '../helpers/team.helper';
import { createMeetingItem, updateMeetingItem, getMeetingItem, cleanupMeetingItems } from '../helpers/meeting-items.helper';
import { format } from 'date-fns';

test.describe('Priorities', () => {
  let teamId: string;
  let meetingId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    const team = await createTeam({ name: 'Test Team' });
    teamId = team.id;
    
    // Create a meeting for testing
    const { data: meeting } = await supabase
      .from('weekly_meetings')
      .insert({
        team_id: teamId,
        recurring_meeting_id: 'test-meeting',
        week_start_date: format(new Date(), 'yyyy-MM-dd')
      })
      .select()
      .single();
    
    meetingId = meeting.id;

    // Create agenda item (required for priorities)
    await createMeetingItem({
      meetingId,
      type: 'agenda',
      title: 'Test Agenda Item'
    });
  });

  test.afterEach(async () => {
    await cleanupMeetingItems(meetingId);
  });

  test('should create a new priority', async ({ page }) => {
    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

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
    const priority = await createMeetingItem({
      meetingId,
      type: 'priority',
      title: 'Initial Priority',
      notes: 'Initial notes'
    });

    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

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

    // Verify in database
    const updatedItem = await getMeetingItem(priority.id);
    expect(updatedItem.notes).toBe('Updated notes');
    expect(updatedItem.is_completed).toBe(true);
  });

  test('should reorder priorities using drag and drop', async ({ page }) => {
    // Create multiple priorities via API
    const priority1 = await createMeetingItem({
      meetingId,
      type: 'priority',
      title: 'First Priority',
      orderIndex: 0
    });

    const priority2 = await createMeetingItem({
      meetingId,
      type: 'priority',
      title: 'Second Priority',
      orderIndex: 1
    });

    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

    // Get the drag handles
    const firstPriorityHandle = page.locator('.cursor-grab').first();
    const secondPriorityHandle = page.locator('.cursor-grab').nth(1);

    // Perform drag and drop
    await firstPriorityHandle.dragTo(secondPriorityHandle);

    // Verify order in UI
    const priorities = await page.locator('.font-medium').allTextContents();
    expect(priorities[0]).toBe('Second Priority');
    expect(priorities[1]).toBe('First Priority');

    // Verify order in database
    const { data: updatedPriorities } = await supabase
      .from('meeting_items')
      .select('title, order_index')
      .eq('meeting_id', meetingId)
      .eq('type', 'priority')
      .order('order_index');

    expect(updatedPriorities[0].title).toBe('Second Priority');
    expect(updatedPriorities[1].title).toBe('First Priority');
  });

  test('should delete a priority', async ({ page }) => {
    // Create a priority via API
    const priority = await createMeetingItem({
      meetingId,
      type: 'priority',
      title: 'Priority to Delete',
      notes: 'Some notes'
    });

    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

    // Verify priority exists
    await expect(page.getByText('Priority to Delete')).toBeVisible();

    // Delete the priority
    await page.getByRole('button', { name: 'Delete' }).click();

    // Verify priority was deleted
    await expect(page.getByText('Priority to Delete')).not.toBeVisible();
    await expect(page.getByText('No priorities yet')).toBeVisible();

    // Verify in database
    const { data } = await supabase
      .from('meeting_items')
      .select()
      .eq('id', priority.id);
    expect(data).toHaveLength(0);
  });

  test('should handle validation and errors', async ({ page }) => {
    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

    // Try to add empty priority
    await page.getByRole('button', { name: /Add Priorities/i }).click();
    await page.getByRole('button', { name: '+' }).click();
    
    // Verify add button is disabled
    await expect(page.getByRole('button', { name: '+' })).toBeDisabled();

    // Fill title and verify button is enabled
    await page.getByPlaceholder('Priority title').fill('Test Priority');
    await expect(page.getByRole('button', { name: '+' })).toBeEnabled();

    // Test error handling (simulate error by temporarily disconnecting)
    await page.route('**/rest/v1/meeting_items**', route => route.abort());
    await page.getByRole('button', { name: '+' }).click();
    await expect(page.getByText('Failed to add priority')).toBeVisible();
  });

  test('should require agenda items before adding priorities', async ({ page }) => {
    // Remove agenda items
    await cleanupMeetingItems(meetingId);
    
    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

    // Verify message about requiring agenda
    await expect(page.getByText('Priorities can be added once the agenda for the meeting has been set.')).toBeVisible();

    // Verify Add Priorities button is not visible
    await expect(page.getByRole('button', { name: /Add Priorities/i })).not.toBeVisible();
  });
});
