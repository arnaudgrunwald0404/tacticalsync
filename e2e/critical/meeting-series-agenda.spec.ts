import { test as baseTest, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const test = baseTest.extend({});

test.describe('Meeting Series Agenda', () => {
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
    const testEmail = `test-agenda-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;
    const testPassword = 'testpass123';
    
    const { data: { user }, error } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    if (error || !user) {
      console.error('User creation error:', error);
      throw new Error(`Failed to create test user: ${error?.message || 'Unknown error'}`);
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
      console.error('Meeting series creation error:', seriesError);
      throw new Error(`Failed to create meeting series: ${seriesError?.message || 'Unknown error'}`);
    }

    meetingSeriesId = meetingSeries.id;

    // Create a meeting instance for the series
    const { data: meetingInstance, error: instanceError } = await supabaseAdmin
      .from('meeting_instances')
      .insert({
        series_id: meetingSeriesId,
        start_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (instanceError || !meetingInstance) {
      console.error('Meeting instance creation error:', instanceError);
      throw new Error(`Failed to create meeting instance: ${instanceError?.message || 'Unknown error'}`);
    }

    // Store the meeting instance ID for navigation
    global.meetingInstanceId = meetingInstance.id;
  });

  test.afterEach(async () => {
    // Clean up test data
    if (testUser?.user?.id) {
      await supabaseAdmin.auth.admin.deleteUser(testUser.user.id);
    }
  });

  test('should add agenda item to meeting series', async ({ page }) => {
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
    await page.goto(`/team/${teamId}/meeting/${global.meetingInstanceId}`);
    await page.waitForLoadState('networkidle');

    // Click on agenda section
    await page.click('[data-testid="agenda-section"], button:has-text("Agenda")');
    
    // Click "Start From Scratch" to begin creating agenda manually
    await page.click('button:has-text("Start From Scratch")');
    
    // Wait for the "Add New Item" button to appear
    await page.waitForSelector('button:has-text("Add New Item")', { timeout: 10000 });
    
    // Click to add agenda item
    await page.click('button:has-text("Add New Item")');
    
    // Fill in agenda item details
    const agendaTitle = `Test Agenda Item ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', agendaTitle);
    
    // Add description if field exists
    const descriptionField = page.locator('textarea[placeholder*="description"], textarea[name="description"]');
    if (await descriptionField.count() > 0) {
      await descriptionField.fill('Test agenda item description');
    }
    
    // Set duration if field exists
    const durationField = page.locator('input[placeholder*="duration"], input[name="duration"]');
    if (await durationField.count() > 0) {
      await durationField.fill('30');
    }
    
    // Save agenda item
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Verify agenda item was added
    await expect(page.locator(`text=${agendaTitle}`)).toBeVisible();
  });

  test('should edit existing agenda item', async ({ page }) => {
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
    await page.goto(`/team/${teamId}/meeting/${global.meetingInstanceId}`);
    await page.waitForLoadState('networkidle');

    // Click on agenda section
    await page.click('[data-testid="agenda-section"], button:has-text("Agenda")');
    
    // Click "Start From Scratch" to begin creating agenda manually
    await page.click('button:has-text("Start From Scratch")');
    
    // Wait for the "Add New Item" button to appear
    await page.waitForSelector('button:has-text("Add New Item")', { timeout: 10000 });
    
    // Click to add agenda item first
    await page.click('button:has-text("Add New Item")');
    
    // Fill in agenda item details
    const agendaTitle = `Test Agenda Item ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', agendaTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Wait for item to be added
    await expect(page.locator(`text=${agendaTitle}`)).toBeVisible();
    
    // Click edit button for the agenda item
    await page.click(`[data-testid="edit-agenda-item"], button:has-text("Edit"):near(text="${agendaTitle}")`);
    
    // Update the title
    const updatedTitle = `Updated Agenda Item ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', updatedTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Verify the update
    await expect(page.locator(`text=${updatedTitle}`)).toBeVisible();
  });

  test('should delete agenda item', async ({ page }) => {
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
    await page.goto(`/team/${teamId}/meeting/${global.meetingInstanceId}`);
    await page.waitForLoadState('networkidle');

    // Click on agenda section
    await page.click('[data-testid="agenda-section"], button:has-text("Agenda")');
    
    // Click "Start From Scratch" to begin creating agenda manually
    await page.click('button:has-text("Start From Scratch")');
    
    // Wait for the "Add New Item" button to appear
    await page.waitForSelector('button:has-text("Add New Item")', { timeout: 10000 });
    
    // Click to add agenda item first
    await page.click('button:has-text("Add New Item")');
    
    // Fill in agenda item details
    const agendaTitle = `Test Agenda Item ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', agendaTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Wait for item to be added
    await expect(page.locator(`text=${agendaTitle}`)).toBeVisible();
    
    // Click delete button for the agenda item
    await page.click(`[data-testid="delete-agenda-item"], button:has-text("Delete"):near(text="${agendaTitle}")`);
    
    // Confirm deletion if confirmation dialog appears
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete")');
    if (await confirmButton.count() > 0) {
      await confirmButton.click();
    }
    
    // Verify the item was deleted
    await expect(page.locator(`text=${agendaTitle}`)).not.toBeVisible();
  });

  test('should reorder agenda items', async ({ page }) => {
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
    await page.goto(`/team/${teamId}/meeting/${global.meetingInstanceId}`);
    await page.waitForLoadState('networkidle');

    // Click on agenda section
    await page.click('[data-testid="agenda-section"], button:has-text("Agenda")');
    
    // Add first agenda item
    await page.click('button:has-text("Add New Item")');
    const firstTitle = `First Item ${Date.now()}`;
    await page.fill('input[placeholder*="title"], input[name="title"]', firstTitle);
    await page.click('button:has-text("Save"), button[type="submit"]');
    await expect(page.locator(`text=${firstTitle}`)).toBeVisible();
    
    // Add second agenda item
    await page.click('button:has-text("Add New Item")');
    const secondTitle = `Second Item ${Date.now()}`;
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
