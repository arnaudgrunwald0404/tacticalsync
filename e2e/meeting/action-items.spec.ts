import { test, expect } from '@playwright/test';
import { loginAsTestUser } from '../helpers/auth.helper';
import { createTeam } from '../helpers/team.helper';
import { createMeetingItem, updateMeetingItem, getMeetingItem, cleanupMeetingItems } from '../helpers/meeting-items.helper';
import { format } from 'date-fns';

test.describe('Action Items', () => {
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
  });

  test.afterEach(async () => {
    await cleanupMeetingItems(meetingId);
  });

  test('should create a new action item', async ({ page }) => {
    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

    // Click the "Add Actions" button
    await page.getByRole('button', { name: /Add Actions/i }).click();

    // Fill in the action item details
    await page.getByPlaceholder('Action item title').fill('Test Action Item');
    await page.getByRole('button', { name: /Who\?/i }).click();
    await page.getByRole('option', { name: /Test User/i }).click();
    await page.getByRole('button', { name: /Due Date/i }).click();
    await page.getByRole('button', { name: format(new Date(), 'MMM d, yyyy') }).click();
    await page.getByPlaceholder('Notes (optional)').fill('Test notes');

    // Click the add button
    await page.getByRole('button', { name: '+' }).click();

    // Verify the action item was added
    await expect(page.getByText('Test Action Item')).toBeVisible();
    await expect(page.getByText('Test notes')).toBeVisible();
    await expect(page.getByText(format(new Date(), 'PPP'))).toBeVisible();
  });

  test('should edit an existing action item', async ({ page }) => {
    // Create an action item via API
    const actionItem = await createMeetingItem({
      meetingId,
      type: 'action_item',
      title: 'Initial Action Item',
      notes: 'Initial notes',
      dueDate: format(new Date(), 'yyyy-MM-dd')
    });

    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

    // Verify initial state
    await expect(page.getByText('Initial Action Item')).toBeVisible();
    await expect(page.getByText('Initial notes')).toBeVisible();

    // Edit the action item
    const notesEditor = page.locator('rich-text-editor').filter({ hasText: 'Initial notes' });
    await notesEditor.click();
    await notesEditor.fill('Updated notes');

    // Toggle completion
    await page.getByRole('checkbox').click();

    // Verify changes
    await expect(page.getByText('Updated notes')).toBeVisible();
    await expect(page.getByRole('checkbox')).toBeChecked();

    // Verify in database
    const updatedItem = await getMeetingItem(actionItem.id);
    expect(updatedItem.notes).toBe('Updated notes');
    expect(updatedItem.is_completed).toBe(true);
  });

  test('should delete an action item', async ({ page }) => {
    // Create an action item via API
    const actionItem = await createMeetingItem({
      meetingId,
      type: 'action_item',
      title: 'Action Item to Delete',
      notes: 'Some notes'
    });

    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

    // Verify item exists
    await expect(page.getByText('Action Item to Delete')).toBeVisible();

    // Delete the item
    await page.getByRole('button', { name: 'Delete' }).click();

    // Verify item was deleted
    await expect(page.getByText('Action Item to Delete')).not.toBeVisible();
    await expect(page.getByText('No action items yet')).toBeVisible();

    // Verify in database
    const { data } = await supabase
      .from('meeting_items')
      .select()
      .eq('id', actionItem.id);
    expect(data).toHaveLength(0);
  });

  test('should handle validation and errors', async ({ page }) => {
    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

    // Try to add empty action item
    await page.getByRole('button', { name: /Add Actions/i }).click();
    await page.getByRole('button', { name: '+' }).click();
    
    // Verify add button is disabled
    await expect(page.getByRole('button', { name: '+' })).toBeDisabled();

    // Fill title and verify button is enabled
    await page.getByPlaceholder('Action item title').fill('Test Action Item');
    await expect(page.getByRole('button', { name: '+' })).toBeEnabled();

    // Test error handling (simulate error by temporarily disconnecting)
    await page.route('**/rest/v1/meeting_items**', route => route.abort());
    await page.getByRole('button', { name: '+' }).click();
    await expect(page.getByText('Failed to add action item')).toBeVisible();
  });
});
