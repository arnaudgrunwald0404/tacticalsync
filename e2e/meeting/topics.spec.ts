import { test, expect } from '@playwright/test';
import { loginAsTestUser, createVerifiedUser, deleteUser, generateTestEmail } from '../helpers/auth.helper';
import { createTeam, addTeamMember } from '../helpers/team.helper';
import { createRecurringMeeting, createWeeklyMeeting } from '../helpers/meeting.helper';
import { createMeetingItem, updateMeetingItem, getMeetingItem, cleanupMeetingItems } from '../helpers/meeting-items.helper';
import { supabase } from '../helpers/supabase.helper';
import { format } from 'date-fns';

test.describe('Topics', () => {
  let teamId: string;
  let meetingId: string;
  let userId: string;

  test.beforeEach(async ({ page }) => {
    // Create and login as test user with unique email
    const uniqueEmail = generateTestEmail('topics-test');
    const user = await createVerifiedUser(uniqueEmail, 'Test123456!');
    userId = user.id;
    
    // Make user an admin (required for creating teams and meetings)
    const { supabaseAdmin } = await import('../helpers/supabase.helper');
    await supabaseAdmin
      .from('profiles')
      .update({ is_admin: true })
      .eq('id', userId);
    
    await loginAsTestUser(page, user.email, user.password);
    
    // Create team
    const team = await createTeam(userId, 'Test Team');
    teamId = team.id;
    
    // Add user to team as admin
    await addTeamMember(teamId, userId, 'admin');
    
    // Create meeting series and instance
    const series = await createRecurringMeeting(teamId, 'Test Meeting', 'weekly', userId);
    const instance = await createWeeklyMeeting(teamId, series.id);
    meetingId = instance.id;
  });

  test.afterEach(async () => {
    await cleanupMeetingItems(meetingId);
    // Clean up test user
    if (userId) {
      await deleteUser(userId);
    }
  });

  test('should create a new topic', async ({ page }) => {
    await page.goto(`/team/${teamId}/meeting/${meetingId}`);
    await page.waitForLoadState('networkidle');
    
    // Wait for the topics section to load
    await page.waitForSelector('text=Add Topic', { timeout: 10000 });

    // Fill in the topic details (the form is already visible on the page)
    // Use .first() to target the first visible input (desktop layout takes precedence)
    const titleInput = page.getByPlaceholder('Topic title...').first();
    await titleInput.waitFor({ state: 'visible', timeout: 5000 });
    await titleInput.fill('Test Topic');
    
    // Click the "Add Topic" button using the aria-label
    const addButton = page.getByLabel('Add Topic').first();
    await addButton.waitFor({ state: 'visible', timeout: 5000 });
    await expect(addButton).toBeEnabled({ timeout: 5000 });
    await addButton.click();

    // Wait for the topic to appear in the list
    await expect(page.getByText('Test Topic')).toBeVisible({ timeout: 10000 });
    
    // Verify in database
    const { data: topics } = await supabase
      .from('meeting_instance_topics')
      .select('*')
      .eq('instance_id', meetingId)
      .eq('title', 'Test Topic');
    
    expect(topics).toHaveLength(1);
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
      .from('meeting_instance_topics')
      .select('title, order_index')
      .eq('instance_id', meetingId)
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
      .from('meeting_instance_topics')
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
