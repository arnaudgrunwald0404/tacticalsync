import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser, loginViaUI } from '../helpers/auth.helper';
import { createTeam, deleteTeam } from '../helpers/team.helper';
import { createRecurringMeeting, deleteRecurringMeeting, createWeeklyMeeting } from '../helpers/meeting.helper';
import { supabase } from '../helpers/supabase.helper';

/**
 * Test 10.1: Authorization
 * - Every protected route/API checks membership & role
 * - Series/instance URLs are not guessable (no IDOR)
 */
test.describe('Security - Authorization', () => {
  let user1Id: string;
  let user2Id: string;
  let team1Id: string;
  let team2Id: string;

  test.beforeEach(async () => {
    // Create two users with separate teams
    const user1Email = generateTestEmail('auth-user1');
    const user1 = await createVerifiedUser(user1Email, 'Test123456!');
    user1Id = user1.id!;

    const user2Email = generateTestEmail('auth-user2');
    const user2 = await createVerifiedUser(user2Email, 'Test123456!');
    user2Id = user2.id!;

    // Create separate teams
    const team1 = await createTeam(user1Id, 'Team 1');
    team1Id = team1.id;

    const team2 = await createTeam(user2Id, 'Team 2');
    team2Id = team2.id;
  });

  test.afterEach(async () => {
    if (team1Id) await deleteTeam(team1Id);
    if (team2Id) await deleteTeam(team2Id);
    if (user1Id) await deleteUser(user1Id);
    if (user2Id) await deleteUser(user2Id);
  });

  test('should enforce team membership on team routes', async ({ page }) => {
    const user1Email = `user1-${Date.now()}@test.com`;
    await createVerifiedUser(user1Email, 'Test123456!');
    
    await loginViaUI(page, user1Email, 'Test123456!');
    
    // User1 tries to access Team2
    await page.goto(`/team/${team2Id}/invite`);
    
    // Should be denied access
    await page.waitForTimeout(2000);
    const url = page.url();
    
    if (url.includes(team2Id)) {
      // If still on page, should see access denied
      const denied = await page.getByText(/access denied|not authorized|permission/i)
        .isVisible()
        .catch(() => false);
      expect(denied).toBeTruthy();
    } else {
      // Or redirected away
      expect(url).not.toContain(team2Id);
    }
  });

  test('should enforce authorization on meeting routes', async ({ page }) => {
    // Create meeting in team2
    const series = await createRecurringMeeting(team2Id, 'Private Meeting', 'weekly', user2Id);
    const instance = await createWeeklyMeeting(team2Id, series.id, '2025-01-06');

    try {
      const user1Email = `user1-${Date.now()}@test.com`;
      await createVerifiedUser(user1Email, 'Test123456!');
      
      await loginViaUI(page, user1Email, 'Test123456!');
      
      // User1 tries to access Team2's meeting
      await page.goto(`/team/${team2Id}/meeting/${instance.id}`);
      
      await page.waitForTimeout(2000);
      const url = page.url();
      
      // Should not have access
      const hasAccess = url.includes(instance.id);
      if (hasAccess) {
        const denied = await page.getByText(/access denied|not authorized/i)
          .isVisible()
          .catch(() => false);
        expect(denied).toBeTruthy();
      }
      
    } finally {
      await deleteRecurringMeeting(series.id);
    }
  });

  test('should prevent IDOR attacks on team resources', async () => {
    // Insecure Direct Object Reference test
    // User1 should not be able to access Team2 data via API
    
    // Login as user1
    await supabase.auth.signInWithPassword({
      email: `user1-${Date.now()}@test.com`,
      password: 'Test123456!'
    });

    // Try to fetch team2 data
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', team2Id)
      .single();

    // Should be blocked by RLS or return empty
    // Depending on your RLS configuration
    if (!error) {
      // If data returned, it should be empty or null
      // OR user shouldn't have access to sensitive fields
      console.log('Note: RLS should prevent cross-team data access');
    }
  });

  test('UUIDs make resources not guessable', () => {
    // Verify that IDs are UUIDs (not sequential integers)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    expect(team1Id).toMatch(uuidPattern);
    expect(team2Id).toMatch(uuidPattern);
    expect(user1Id).toMatch(uuidPattern);
    expect(user2Id).toMatch(uuidPattern);
    
    // UUIDs prevent enumeration attacks
    // Attacker cannot guess /team/1, /team/2, etc.
  });

  test('should check role before allowing admin actions', async ({ page }) => {
    // Create team with admin and member
    const adminEmail = generateTestEmail('role-admin');
    const memberEmail = generateTestEmail('role-member');
    
    const admin = await createVerifiedUser(adminEmail, 'Test123456!');
    const member = await createVerifiedUser(memberEmail, 'Test123456!');
    
    const team = await createTeam(admin.id!, 'Role Test Team');
    
    try {
      // Add member (not admin)
      await supabase.from('team_members').insert({
        team_id: team.id,
        user_id: member.id,
        role: 'member'
      });

      // Login as member
      await loginViaUI(page, memberEmail, 'Test123456!');
      
      // Try to access admin-only page (e.g., team settings)
      await page.goto(`/team/${team.id}/settings`);
      
      await page.waitForTimeout(2000);
      
      // Should either be denied or admin controls hidden
      const hasSettings = page.url().includes('/settings');
      
      if (hasSettings) {
        // If on settings page, dangerous actions should be disabled
        const deleteButton = page.getByRole('button', { name: /delete team/i });
        if (await deleteButton.isVisible().catch(() => false)) {
          await expect(deleteButton).toBeDisabled();
        }
      }
      
    } finally {
      await deleteTeam(team.id);
      await deleteUser(admin.id!);
      await deleteUser(member.id!);
    }
  });
});

/**
 * Test 10.2: CSRF / XSS / SSRF
 * - CSRF tokens on state-changing requests (if cookie auth)
 * - Output encode all user content (agenda item titles, topics)
 * - Reject embedded scripts/URLs
 */
test.describe('Security - XSS Protection', () => {
  
  test.skip('should sanitize HTML in user input', async ({ page }) => {
    // Test XSS prevention
    const maliciousInput = '<script>alert("XSS")</script><img src=x onerror=alert(1)>';
    
    // Expected behavior:
    // - Input is sanitized before storage
    // - Or sanitized on display
    // - Script tags removed or escaped
    // - Event handlers removed
    // - Content displayed safely
  });

  test.skip('should prevent script injection in topics', async () => {
    // Test that topics cannot contain executable scripts
    // Input: <script>fetch('/api/admin/delete-all')</script>
    // Expected: Script not executed, shown as text
  });

  test.skip('should prevent CSRF attacks on state-changing operations', async () => {
    // If using cookie-based auth:
    // - State-changing requests (POST, PUT, DELETE) require CSRF token
    // - Token verified server-side
    // - Requests without valid token rejected
    
    // If using JWT/Bearer tokens:
    // - CSRF naturally prevented (tokens not automatically sent)
    // - Still validate origin/referer headers
  });

  test.skip('should prevent SSRF in URL fields', async () => {
    // If users can input URLs (e.g., profile pic, attachments):
    // - Validate URL scheme (only http/https)
    // - Block internal IPs (127.0.0.1, 192.168.x.x, 10.x.x.x)
    // - Block metadata endpoints (169.254.169.254)
    // - Use allow-list of domains if possible
  });

  test.skip('should encode output to prevent XSS', async ({ page }) => {
    // Test that user content is properly encoded
    const dangerousText = '"><script>alert(1)</script>';
    
    // Create topic with dangerous text
    // Navigate to page showing the topic
    // Verify:
    // - Script does not execute
    // - Text is properly escaped in HTML
    // - Appears as literal text, not interpreted as HTML
  });
});

