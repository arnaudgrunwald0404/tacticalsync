import { test as baseTest, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const test = baseTest.extend({});

test.describe('Meeting Instance Topics', () => {
  let supabaseAdmin: { id: string; email: string };
  let testUser: { id: string; email: string };
  let teamId: string;
  let meetingSeriesId: string;
  let meetingInstanceId: string;

  test.beforeEach(async () => {
    // Create admin client for user management
    supabaseAdmin = createClient(
      'http://127.0.0.1:54321',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Create test user with more unique email
    const testEmail = `test-topics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;
    const testPassword = 'testpass123';
    
    const { data: { user }, error } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    if (error || !user) {
      throw new Error('Failed to create test user');
    }

    testUser = { user, email: testEmail, password: testPassword };

    // Create a test team
    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .insert({
        name: `Test Team ${Date.now()}`,
        abbreviated_name: 'TT',
        created_by: user.id,
      })
      .select()
      .single();

    if (teamError || !team) {
      throw new Error('Failed to create test team');
    }

    teamId = team.id;

    // Add user to team
    await supabaseAdmin
      .from('team_members')
      .insert({
        team_id: teamId,
        user_id: user.id,
        role: 'admin',
      });

    // Create a meeting series
    const { data: meetingSeries, error: seriesError } = await supabaseAdmin
      .from('meeting_series')
      .insert({
        team_id: teamId,
        name: `Test Meeting Series ${Date.now()}`,
        frequency: 'weekly',
        created_by: user.id,
      })
      .select()
      .single();

    if (seriesError || !meetingSeries) {
      throw new Error('Failed to create meeting series');
    }

    meetingSeriesId = meetingSeries.id;

    // Create a meeting instance
    const { data: meetingInstance, error: instanceError } = await supabaseAdmin
      .from('meeting_instances')
      .insert({
        series_id: meetingSeriesId,
        start_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (instanceError || !meetingInstance) {
      throw new Error('Failed to create meeting instance');
    }

    meetingInstanceId = meetingInstance.id;
  });

  test.afterEach(async () => {
    // Clean up test data
    if (testUser?.user?.id) {
      await supabaseAdmin.auth.admin.deleteUser(testUser.user.id);
    }
  });

  test('should add topic to meeting instance', async ({ page }) => {
    // Login first
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Click to reveal email/password form
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => url.pathname.includes('/dashboard') || url.pathname.includes('/create-team'), { timeout: 10000 });

    // Navigate to meeting instance
    await page.goto(`/team/${teamId}/meeting/${meetingInstanceId}`);
    await page.waitForLoadState('networkidle');

    // Click on topics section
    await page.click('[data-testid="topics-section"], button:has-text("Topics")');
    
    // Fill in topic details first
    const topicTitle = `Test Topic ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', topicTitle);
    
    // Click to add topic
    await page.click('button:has-text("Add Topic")');
    
    // Add notes if field exists
    const notesField = page.locator('textarea[placeholder*="notes"], textarea[name="notes"]');
    if (await notesField.count() > 0) {
      await notesField.fill('Test topic notes');
    }
    
    // Assign to user if field exists
    const assigneeField = page.locator('select[name="assignee"], input[placeholder*="assign"]');
    if (await assigneeField.count() > 0) {
      await assigneeField.selectOption(testUser.user.id);
    }
    
    // Save topic
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Verify topic was added
    await expect(page.locator(`text=${topicTitle}`)).toBeVisible();
  });

  test('should edit existing topic', async ({ page }) => {
    // Login first
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Click to reveal email/password form
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => url.pathname.includes('/dashboard') || url.pathname.includes('/create-team'), { timeout: 10000 });

    // Navigate to meeting instance
    await page.goto(`/team/${teamId}/meeting/${meetingInstanceId}`);
    await page.waitForLoadState('networkidle');

    // Click on topics section
    await page.click('[data-testid="topics-section"], button:has-text("Topics")');
    
    // Click to add topic first
    await page.click('button:has-text("Add Topic"), button:has-text("Add new topic")');
    
    // Fill in topic details
    const topicTitle = `Test Topic ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', topicTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Wait for topic to be added
    await expect(page.locator(`text=${topicTitle}`)).toBeVisible();
    
    // Click edit button for the topic
    await page.click(`[data-testid="edit-topic"], button:has-text("Edit"):near(text="${topicTitle}")`);
    
    // Update the title
    const updatedTitle = `Updated Topic ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', updatedTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Verify the update
    await expect(page.locator(`text=${updatedTitle}`)).toBeVisible();
  });

  test('should mark topic as completed', async ({ page }) => {
    // Login first
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Click to reveal email/password form
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => url.pathname.includes('/dashboard') || url.pathname.includes('/create-team'), { timeout: 10000 });

    // Navigate to meeting instance
    await page.goto(`/team/${teamId}/meeting/${meetingInstanceId}`);
    await page.waitForLoadState('networkidle');

    // Click on topics section
    await page.click('[data-testid="topics-section"], button:has-text("Topics")');
    
    // Click to add topic first
    await page.click('button:has-text("Add Topic"), button:has-text("Add new topic")');
    
    // Fill in topic details
    const topicTitle = `Test Topic ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', topicTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Wait for topic to be added
    await expect(page.locator(`text=${topicTitle}`)).toBeVisible();
    
    // Click checkbox to mark as completed
    await page.click(`input[type="checkbox"]:near(text="${topicTitle}"), [data-testid="complete-topic"]`);
    
    // Verify the topic is marked as completed
    const completedTopic = page.locator(`text=${topicTitle}`).locator('..');
    await expect(completedTopic).toHaveClass(/completed|strikethrough|line-through/);
  });

  test('should delete topic', async ({ page }) => {
    // Login first
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Click to reveal email/password form
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => url.pathname.includes('/dashboard') || url.pathname.includes('/create-team'), { timeout: 10000 });

    // Navigate to meeting instance
    await page.goto(`/team/${teamId}/meeting/${meetingInstanceId}`);
    await page.waitForLoadState('networkidle');

    // Click on topics section
    await page.click('[data-testid="topics-section"], button:has-text("Topics")');
    
    // Click to add topic first
    await page.click('button:has-text("Add Topic"), button:has-text("Add new topic")');
    
    // Fill in topic details
    const topicTitle = `Test Topic ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', topicTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Wait for topic to be added
    await expect(page.locator(`text=${topicTitle}`)).toBeVisible();
    
    // Click delete button for the topic
    await page.click(`[data-testid="delete-topic"], button:has-text("Delete"):near(text="${topicTitle}")`);
    
    // Confirm deletion if confirmation dialog appears
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete")');
    if (await confirmButton.count() > 0) {
      await confirmButton.click();
    }
    
    // Verify the topic was deleted
    await expect(page.locator(`text=${topicTitle}`)).not.toBeVisible();
  });

  test('should reorder topics', async ({ page }) => {
    // Login first
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Click to reveal email/password form
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => url.pathname.includes('/dashboard') || url.pathname.includes('/create-team'), { timeout: 10000 });

    // Navigate to meeting instance
    await page.goto(`/team/${teamId}/meeting/${meetingInstanceId}`);
    await page.waitForLoadState('networkidle');

    // Click on topics section
    await page.click('[data-testid="topics-section"], button:has-text("Topics")');
    
    // Add first topic
    await page.click('button:has-text("Add Topic"), button:has-text("Add new topic")');
    const firstTopic = `First Topic ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', firstTopic);
    await page.click('button:has-text("Save"), button[type="submit"]');
    await expect(page.locator(`text=${firstTopic}`)).toBeVisible();
    
    // Add second topic
    await page.click('button:has-text("Add Topic"), button:has-text("Add new topic")');
    const secondTopic = `Second Topic ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', secondTopic);
    await page.click('button:has-text("Save"), button[type="submit"]');
    await expect(page.locator(`text=${secondTopic}`)).toBeVisible();
    
    // Test drag and drop reordering if drag handles exist
    const dragHandle = page.locator('[data-testid="drag-handle"], .drag-handle').first();
    if (await dragHandle.count() > 0) {
      const secondItem = page.locator(`text=${secondTopic}`).locator('..');
      await dragHandle.dragTo(secondItem);
      
      // Verify topics are still visible after reordering
      await expect(page.locator(`text=${firstTopic}`)).toBeVisible();
      await expect(page.locator(`text=${secondTopic}`)).toBeVisible();
    }
  });

  test('should add topic with rich text notes', async ({ page }) => {
    // Login first
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Click to reveal email/password form
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => url.pathname.includes('/dashboard') || url.pathname.includes('/create-team'), { timeout: 10000 });

    // Navigate to meeting instance
    await page.goto(`/team/${teamId}/meeting/${meetingInstanceId}`);
    await page.waitForLoadState('networkidle');

    // Click on topics section
    await page.click('[data-testid="topics-section"], button:has-text("Topics")');
    
    // Click to add topic
    await page.click('button:has-text("Add Topic"), button:has-text("Add new topic")');
    
    // Fill in topic details
    const topicTitle = `Test Topic with Notes ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', topicTitle);
    
    // Add rich text notes if field exists
    const notesField = page.locator('[data-testid="rich-text-editor"], .ProseMirror, textarea[placeholder*="notes"]');
    if (await notesField.count() > 0) {
      await notesField.click();
      await notesField.fill('This is a test topic with **bold** and *italic* formatting.');
    }
    
    // Save topic
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Verify topic was added
    await expect(page.locator(`text=${topicTitle}`)).toBeVisible();
  });
});
