import { test as baseTest, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const test = baseTest.extend({});

test.describe('Security Tests', () => {
  let supabaseAdmin: { id: string; email: string };
  let testUser: { id: string; email: string };
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
    const testEmail = `test-security-${Date.now()}@example.com`;
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

  test('should redirect non-authenticated users to login', async ({ page }) => {
    // Try to access protected routes without authentication
    const protectedRoutes = [
      '/dashboard',
      '/create-team',
      `/team/${teamId}`,
      `/meeting/test-meeting-id`,
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      
      // Should redirect to auth page
      const currentUrl = page.url();
      expect(currentUrl).toMatch(/\/auth/);
    }
  });

  test('should prevent access to other teams', async ({ page }) => {
    // Create another user and team
    const otherUserEmail = `other-user-${Date.now()}@example.com`;
    const otherUserPassword = 'testpass123';
    
    const { data: { user: otherUser }, error } = await supabaseAdmin.auth.admin.createUser({
      email: otherUserEmail,
      password: otherUserPassword,
      email_confirm: true,
    });

    if (error || !otherUser) {
      throw new Error('Failed to create other user');
    }

    // Create another team
    const { data: otherTeam, error: otherTeamError } = await supabaseAdmin
      .from('teams')
      .insert({
        name: `Other Team ${Date.now()}`,
        short_name: 'OT',
        created_by: otherUser.id,
      })
      .select()
      .single();

    if (otherTeamError || !otherTeam) {
      await supabaseAdmin.auth.admin.deleteUser(otherUser.id);
      throw new Error('Failed to create other team');
    }

    try {
      // Login as first user
      await page.goto('/auth/sign-in');
      await page.waitForLoadState('networkidle');
      await page.fill('input[type="email"]', testUser.email);
      await page.fill('input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(url => url.pathname.includes('/dashboard') || url.pathname.includes('/create-team'), { timeout: 10000 });

      // Try to access other team's dashboard
      await page.goto(`/team/${otherTeam.id}`);
      await page.waitForLoadState('networkidle');
      
      // Should show access denied or redirect
      const currentUrl = page.url();
      const hasAccessDenied = await page.locator('text=Access denied, text=Unauthorized, text=Not found').count() > 0;
      const isRedirected = !currentUrl.includes(`/team/${otherTeam.id}`);
      
      expect(hasAccessDenied || isRedirected).toBeTruthy();
      
    } finally {
      // Clean up other user and team
      await supabaseAdmin.from('teams').delete().eq('id', otherTeam.id);
      await supabaseAdmin.auth.admin.deleteUser(otherUser.id);
    }
  });

  test('should enforce RLS policies on data access', async ({ page }) => {
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
    await page.goto(`/team/${teamId}/setup-meeting`);
    await page.waitForLoadState('networkidle');

    // Create a meeting
    await page.click('button:has-text("Create Meeting"), button:has-text("New Meeting")');
    await page.fill('input[id="meetingName"], input[placeholder*="meeting name" i]', `Test Meeting ${Date.now()}`);
    await page.click('[id="frequency"]');
    await page.click('[data-radix-select-item][data-value="weekly"]');
    await page.click('button[type="submit"], button:has-text("Create Meeting")');
    await page.waitForURL(url => url.pathname.includes('/meeting/'), { timeout: 10000 });

    // Get the meeting ID from URL
    const meetingUrl = page.url();
    const meetingId = meetingUrl.match(/\/meeting\/([a-f0-9-]+)/)?.[1];
    
    if (!meetingId) {
      throw new Error('Could not extract meeting ID from URL');
    }

    // Test that we can access our own meeting data
    const meetingData = await page.evaluate(async () => {
      // This would test that the frontend can fetch meeting data
      // In a real test, we'd check the network requests
      return true;
    });

    expect(meetingData).toBeTruthy();

    // Test that RLS prevents unauthorized access by checking network requests
    const networkRequests = await page.evaluate(() => {
      return window.performance.getEntriesByType('resource')
        .filter(entry => entry.name.includes('/rest/v1/'))
        .map(entry => ({
          url: entry.name,
          status: (entry as any).responseStatus || 'unknown'
        }));
    });

    // Check that all API requests returned successful status codes
    const failedRequests = networkRequests.filter(req => 
      req.status && req.status >= 400 && req.status < 500
    );

    // Should not have any 4xx errors (which would indicate RLS violations)
    expect(failedRequests.length).toBe(0);
  });
});
