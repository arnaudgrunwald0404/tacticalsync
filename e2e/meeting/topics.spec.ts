import { test, expect } from '@playwright/test';
import { loginAsTestUser } from '../helpers/auth.helper';
import { createTeam } from '../helpers/team.helper';
import { createMeetingItem, updateMeetingItem, getMeetingItem, cleanupMeetingItems } from '../helpers/meeting-items.helper';
import { format } from 'date-fns';

test.describe('Topics', () => {
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

  test('should create a new topic', async ({ page }) => {
    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

    // Click the "Add Topic" button
    await page.getByRole('button', { name: /Add Topic/i }).click();

    // Fill in the topic details
    await page.getByPlaceholder('Topic title').fill('Test Topic');
    await page.getByRole('button', { name: /Who\?/i }).click();
    await page.getByRole('option', { name: /Test User/i }).click();
    await page.getByPlaceholder('Notes (optional)').fill('Test notes');

    // Click the add button
    await page.getByRole('button', { name: '+' }).click();

    // Verify the topic was added
    await expect(page.getByText('Test Topic')).toBeVisible();
    await expect(page.getByText('Test notes')).toBeVisible();
  });

  test('should edit an existing topic', async ({ page }) => {
    // Create a topic via API
    const topic = await createMeetingItem({
      meetingId,
      type: 'topic',
      title: 'Initial Topic',
      notes: 'Initial notes'
    });

    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

    // Verify initial state
    await expect(page.getByText('Initial Topic')).toBeVisible();
    await expect(page.getByText('Initial notes')).toBeVisible();

    // Edit the topic
    const notesEditor = page.locator('rich-text-editor').filter({ hasText: 'Initial notes' });
    await notesEditor.click();
    await notesEditor.fill('Updated notes');

    // Toggle completion
    await page.getByRole('checkbox').click();

    // Verify changes
    await expect(page.getByText('Updated notes')).toBeVisible();
    await expect(page.getByRole('checkbox')).toBeChecked();

    // Verify in database
    const updatedItem = await getMeetingItem(topic.id);
    expect(updatedItem.notes).toBe('Updated notes');
    expect(updatedItem.is_completed).toBe(true);
  });

  test('should reorder topics using drag and drop', async ({ page }) => {
    // Create multiple topics via API
    const topic1 = await createMeetingItem({
      meetingId,
      type: 'topic',
      title: 'First Topic',
      orderIndex: 0
    });

    const topic2 = await createMeetingItem({
      meetingId,
      type: 'topic',
      title: 'Second Topic',
      orderIndex: 1
    });

    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

    // Get the drag handles
    const firstTopicHandle = page.locator('.cursor-grab').first();
    const secondTopicHandle = page.locator('.cursor-grab').nth(1);

    // Perform drag and drop
    await firstTopicHandle.dragTo(secondTopicHandle);

    // Verify order in UI
    const topics = await page.locator('.font-medium').allTextContents();
    expect(topics[0]).toBe('Second Topic');
    expect(topics[1]).toBe('First Topic');

    // Verify order in database
    const { data: updatedTopics } = await supabase
      .from('meeting_items')
      .select('title, order_index')
      .eq('meeting_id', meetingId)
      .order('order_index');

    expect(updatedTopics[0].title).toBe('Second Topic');
    expect(updatedTopics[1].title).toBe('First Topic');
  });

  test('should delete a topic', async ({ page }) => {
    // Create a topic via API
    const topic = await createMeetingItem({
      meetingId,
      type: 'topic',
      title: 'Topic to Delete',
      notes: 'Some notes'
    });

    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

    // Verify topic exists
    await expect(page.getByText('Topic to Delete')).toBeVisible();

    // Delete the topic
    await page.getByRole('button', { name: 'Delete' }).click();

    // Verify topic was deleted
    await expect(page.getByText('Topic to Delete')).not.toBeVisible();
    await expect(page.getByText('No topics yet')).toBeVisible();

    // Verify in database
    const { data } = await supabase
      .from('meeting_items')
      .select()
      .eq('id', topic.id);
    expect(data).toHaveLength(0);
  });

  test('should handle validation and errors', async ({ page }) => {
    await page.goto(`/team/${teamId}/meeting/${meetingId}`);

    // Try to add empty topic
    await page.getByRole('button', { name: /Add Topic/i }).click();
    await page.getByRole('button', { name: '+' }).click();
    
    // Verify add button is disabled
    await expect(page.getByRole('button', { name: '+' })).toBeDisabled();

    // Fill title and verify button is enabled
    await page.getByPlaceholder('Topic title').fill('Test Topic');
    await expect(page.getByRole('button', { name: '+' })).toBeEnabled();

    // Test error handling (simulate error by temporarily disconnecting)
    await page.route('**/rest/v1/meeting_items**', route => route.abort());
    await page.getByRole('button', { name: '+' }).click();
    await expect(page.getByText('Failed to add topic')).toBeVisible();
  });
});
