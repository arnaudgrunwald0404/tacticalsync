import { test as baseTest, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const test = baseTest.extend({});

test.describe('Meeting Flow', () => {
  let supabaseAdmin: any;
  let testUser: any;
  let teamId: string;

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

    // Create test user
    const testEmail = `test-meeting-${Date.now()}@example.com`;
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
  });

  test.afterEach(async () => {
    // Clean up test data
    if (teamId) {
      await supabaseAdmin.from('teams').delete().eq('id', teamId);
    }
    if (testUser?.user?.id) {
      await supabaseAdmin.auth.admin.deleteUser(testUser.user.id);
    }
  });

  test('should create recurring meeting', async ({ page }) => {
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

    // Navigate to team dashboard
    await page.goto(`/team/${teamId}`);
    await page.waitForLoadState('networkidle');

    // Click create meeting button
    await page.click('button:has-text("Create First Meeting"), button:has-text("Add Another Recurring Meeting"), [data-testid="create-meeting-card"]');
    
    // Fill in meeting details
    const meetingName = `Test Meeting ${Date.now()}`;
    await page.fill('input[name="name"], input[placeholder*="meeting name" i]', meetingName);
    await page.click('[id="frequency"]');
    await page.click('[data-radix-select-item][data-value="weekly"]');
    
    // Submit form
    await page.click('button[type="submit"], button:has-text("Create Meeting")');
    
    // Wait for redirect to meeting page
    await page.waitForURL(url => url.pathname.includes('/meeting/'), { timeout: 10000 });
    
    // Verify meeting was created
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/meeting\/[a-f0-9-]+/);
    
    // Verify meeting name is displayed
    const meetingNameElement = await page.textContent('h1, [data-testid="meeting-name"]');
    expect(meetingNameElement).toContain(meetingName);
  });

  test('should add agenda items', async ({ page }) => {
    // Login and navigate to meeting
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Click to reveal email/password form
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => url.pathname.includes('/dashboard') || url.pathname.includes('/create-team'), { timeout: 10000 });

    // Create a meeting first
    await page.goto(`/team/${teamId}/setup-meeting`);
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Create First Meeting"), button:has-text("Add Another Recurring Meeting"), [data-testid="create-meeting-card"]');
    await page.fill('input[id="meetingName"], input[placeholder*="meeting name" i]', `Test Meeting ${Date.now()}`);
    await page.click('[id="frequency"]');
    await page.click('[data-radix-select-item][data-value="weekly"]');
    await page.click('button[type="submit"], button:has-text("Create Meeting")');
    await page.waitForURL(url => url.pathname.includes('/meeting/'), { timeout: 10000 });

    // Click on agenda section
    await page.click('[data-testid="agenda-section"], button:has-text("Agenda")');
    
    // Add agenda item
    await page.click('button:has-text("Add Item"), button:has-text("New Item")');
    await page.fill('input[placeholder*="title" i], input[name="title"]', 'Test Agenda Item');
    await page.fill('textarea[placeholder*="description" i], textarea[name="description"]', 'Test description');
    
    // Save agenda item
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Verify agenda item was added
    const agendaItem = await page.textContent('[data-testid="agenda-item"], .agenda-item');
    expect(agendaItem).toContain('Test Agenda Item');
  });

  test('should add priorities', async ({ page }) => {
    // Login and navigate to meeting
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Click to reveal email/password form
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => url.pathname.includes('/dashboard') || url.pathname.includes('/create-team'), { timeout: 10000 });

    // Create a meeting first
    await page.goto(`/team/${teamId}/setup-meeting`);
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Create First Meeting"), button:has-text("Add Another Recurring Meeting"), [data-testid="create-meeting-card"]');
    await page.fill('input[id="meetingName"], input[placeholder*="meeting name" i]', `Test Meeting ${Date.now()}`);
    await page.click('[id="frequency"]');
    await page.click('[data-radix-select-item][data-value="weekly"]');
    await page.click('button[type="submit"], button:has-text("Create Meeting")');
    await page.waitForURL(url => url.pathname.includes('/meeting/'), { timeout: 10000 });

    // Click on priorities section
    await page.click('[data-testid="priorities-section"], button:has-text("Priorities")');
    
    // Add priority
    await page.click('button:has-text("Add Priority"), button:has-text("New Priority")');
    await page.fill('input[placeholder*="priority" i], input[name="title"]', 'Test Priority');
    await page.fill('textarea[placeholder*="outcome" i], textarea[name="outcome"]', 'Test outcome');
    
    // Save priority
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Verify priority was added
    const priorityItem = await page.textContent('[data-testid="priority-item"], .priority-item');
    expect(priorityItem).toContain('Test Priority');
  });

  test('should add topics', async ({ page }) => {
    // Login and navigate to meeting
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Click to reveal email/password form
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => url.pathname.includes('/dashboard') || url.pathname.includes('/create-team'), { timeout: 10000 });

    // Create a meeting first
    await page.goto(`/team/${teamId}/setup-meeting`);
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Create First Meeting"), button:has-text("Add Another Recurring Meeting"), [data-testid="create-meeting-card"]');
    await page.fill('input[id="meetingName"], input[placeholder*="meeting name" i]', `Test Meeting ${Date.now()}`);
    await page.click('[id="frequency"]');
    await page.click('[data-radix-select-item][data-value="weekly"]');
    await page.click('button[type="submit"], button:has-text("Create Meeting")');
    await page.waitForURL(url => url.pathname.includes('/meeting/'), { timeout: 10000 });

    // Click on topics section
    await page.click('[data-testid="topics-section"], button:has-text("Topics")');
    
    // Add topic
    await page.click('button:has-text("Add Topic"), button:has-text("New Topic")');
    await page.fill('input[placeholder*="topic" i], input[name="title"]', 'Test Topic');
    await page.fill('textarea[placeholder*="notes" i], textarea[name="notes"]', 'Test notes');
    
    // Save topic
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Verify topic was added
    const topicItem = await page.textContent('[data-testid="topic-item"], .topic-item');
    expect(topicItem).toContain('Test Topic');
  });

  test('should add action items', async ({ page }) => {
    // Login and navigate to meeting
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Click to reveal email/password form
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => url.pathname.includes('/dashboard') || url.pathname.includes('/create-team'), { timeout: 10000 });

    // Create a meeting first
    await page.goto(`/team/${teamId}/setup-meeting`);
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Create First Meeting"), button:has-text("Add Another Recurring Meeting"), [data-testid="create-meeting-card"]');
    await page.fill('input[id="meetingName"], input[placeholder*="meeting name" i]', `Test Meeting ${Date.now()}`);
    await page.click('[id="frequency"]');
    await page.click('[data-radix-select-item][data-value="weekly"]');
    await page.click('button[type="submit"], button:has-text("Create Meeting")');
    await page.waitForURL(url => url.pathname.includes('/meeting/'), { timeout: 10000 });

    // Click on action items section
    await page.click('[data-testid="action-items-section"], button:has-text("Action Items")');
    
    // Add action item
    await page.click('button:has-text("Add Action Item"), button:has-text("New Action Item")');
    await page.fill('input[placeholder*="action" i], input[name="title"]', 'Test Action Item');
    await page.fill('textarea[placeholder*="notes" i], textarea[name="notes"]', 'Test notes');
    
    // Save action item
    await page.click('button:has-text("Save"), button[type="submit"]');
    
    // Verify action item was added
    const actionItem = await page.textContent('[data-testid="action-item"], .action-item');
    expect(actionItem).toContain('Test Action Item');
  });
});
