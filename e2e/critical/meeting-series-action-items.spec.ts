import { test as baseTest, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const test = baseTest.extend({});

test.describe('Meeting Series Action Items', () => {
  let supabaseAdmin: any;
  let testUser: any;
  let teamId: string;
  let meetingSeriesId: string;

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
    const testEmail = `test-action-items-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;
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
  });

  test.afterEach(async () => {
    // Clean up test data
    if (testUser?.user?.id) {
      await supabaseAdmin.auth.admin.deleteUser(testUser.user.id);
    }
  });

  test('should add action item to meeting series', async ({ page }) => {
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

    // Navigate to meeting series
    await page.goto(`/team/${teamId}/meeting/${meetingSeriesId}`);
    await page.waitForLoadState('networkidle');

    // Click on action items section
    await page.click('[data-testid="action-items-section"], button:has-text("Action Items")');
    
    // Fill in action item details first
    const actionTitle = `Test Action Item ${Date.now()}`;
    await page.focus('input[id="new-action-item-title"]');
    await page.fill('input[id="new-action-item-title"]', actionTitle);
    
    // Wait a moment for the state to update
    await page.waitForTimeout(1000);
    
    // Click to add action item (button should be enabled now)
    await page.click('button:has-text("Add Action Item")');
    
    // Add description if field exists
    const descriptionField = page.locator('textarea[placeholder*="description"], textarea[name="description"]');
    if (await descriptionField.count() > 0) {
      await descriptionField.fill('Test action item description');
    }
    
    // Set due date if field exists
    const dueDateField = page.locator('input[type="date"], input[placeholder*="due date"]');
    if (await dueDateField.count() > 0) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await dueDateField.fill(tomorrow.toISOString().split('T')[0]);
    }
    
    // Assign to user if field exists
    const assigneeField = page.locator('select[name="assignee"], input[placeholder*="assign"]');
    if (await assigneeField.count() > 0) {
      await assigneeField.selectOption(testUser.user.id);
    }
    
    // Save action item
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Verify action item was added
    await expect(page.locator(`text=${actionTitle}`)).toBeVisible();
  });

  test('should edit existing action item', async ({ page }) => {
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

    // Navigate to meeting series
    await page.goto(`/team/${teamId}/meeting/${meetingSeriesId}`);
    await page.waitForLoadState('networkidle');

    // Click on action items section
    await page.click('[data-testid="action-items-section"], button:has-text("Action Items")');
    
    // Click to add action item first
    await page.click('button:has-text("Add Action Item"), button:has-text("Add Item")');
    
    // Fill in action item details
    const actionTitle = `Test Action Item ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', actionTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Wait for item to be added
    await expect(page.locator(`text=${actionTitle}`)).toBeVisible();
    
    // Click edit button for the action item
    await page.click(`[data-testid="edit-action-item"], button:has-text("Edit"):near(text="${actionTitle}")`);
    
    // Update the title
    const updatedTitle = `Updated Action Item ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', updatedTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Verify the update
    await expect(page.locator(`text=${updatedTitle}`)).toBeVisible();
  });

  test('should mark action item as completed', async ({ page }) => {
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

    // Navigate to meeting series
    await page.goto(`/team/${teamId}/meeting/${meetingSeriesId}`);
    await page.waitForLoadState('networkidle');

    // Click on action items section
    await page.click('[data-testid="action-items-section"], button:has-text("Action Items")');
    
    // Click to add action item first
    await page.click('button:has-text("Add Action Item"), button:has-text("Add Item")');
    
    // Fill in action item details
    const actionTitle = `Test Action Item ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', actionTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Wait for item to be added
    await expect(page.locator(`text=${actionTitle}`)).toBeVisible();
    
    // Click checkbox to mark as completed
    await page.click(`input[type="checkbox"]:near(text="${actionTitle}"), [data-testid="complete-action-item"]`);
    
    // Verify the item is marked as completed (strikethrough or completed styling)
    const completedItem = page.locator(`text=${actionTitle}`).locator('..');
    await expect(completedItem).toHaveClass(/completed|strikethrough|line-through/);
  });

  test('should delete action item', async ({ page }) => {
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

    // Navigate to meeting series
    await page.goto(`/team/${teamId}/meeting/${meetingSeriesId}`);
    await page.waitForLoadState('networkidle');

    // Click on action items section
    await page.click('[data-testid="action-items-section"], button:has-text("Action Items")');
    
    // Click to add action item first
    await page.click('button:has-text("Add Action Item"), button:has-text("Add Item")');
    
    // Fill in action item details
    const actionTitle = `Test Action Item ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', actionTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Wait for item to be added
    await expect(page.locator(`text=${actionTitle}`)).toBeVisible();
    
    // Click delete button for the action item
    await page.click(`[data-testid="delete-action-item"], button:has-text("Delete"):near(text="${actionTitle}")`);
    
    // Confirm deletion if confirmation dialog appears
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete")');
    if (await confirmButton.count() > 0) {
      await confirmButton.click();
    }
    
    // Verify the item was deleted
    await expect(page.locator(`text=${actionTitle}`)).not.toBeVisible();
  });

  test('should reorder action items', async ({ page }) => {
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

    // Navigate to meeting series
    await page.goto(`/team/${teamId}/meeting/${meetingSeriesId}`);
    await page.waitForLoadState('networkidle');

    // Click on action items section
    await page.click('[data-testid="action-items-section"], button:has-text("Action Items")');
    
    // Add first action item
    await page.click('button:has-text("Add Action Item"), button:has-text("Add Item")');
    const firstTitle = `First Action ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', firstTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    await expect(page.locator(`text=${firstTitle}`)).toBeVisible();
    
    // Add second action item
    await page.click('button:has-text("Add Action Item"), button:has-text("Add Item")');
    const secondTitle = `Second Action ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', secondTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    await expect(page.locator(`text=${secondTitle}`)).toBeVisible();
    
    // Test drag and drop reordering if drag handles exist
    const dragHandle = page.locator('[data-testid="drag-handle"], .drag-handle').first();
    if (await dragHandle.count() > 0) {
      const secondItem = page.locator(`text=${secondTitle}`).locator('..');
      await dragHandle.dragTo(secondItem);
      
      // Verify items are still visible after reordering
      await expect(page.locator(`text=${firstTitle}`)).toBeVisible();
      await expect(page.locator(`text=${secondTitle}`)).toBeVisible();
    }
  });
});
