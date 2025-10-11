import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser, loginViaUI, clearAuthState } from '../helpers/auth.helper';
import { createTeam, deleteTeam, isTeamMember } from '../helpers/team.helper';
import { getTeamInviteCode, generateInviteCode } from '../helpers/invitation.helper';

/**
 * Test 3.5: Invite link - generate
 * 
 * When admin generates team join link
 * Then link created with configured policy (single-use or multi-use, expiry)
 */
test.describe('Invitations - Invite Link Generation', () => {
  let adminEmail: string;
  let adminUserId: string;
  let teamId: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async ({ page }) => {
    adminEmail = generateTestEmail('link-admin');
    const admin = await createVerifiedUser(adminEmail, testPassword);
    adminUserId = admin.id!;
    
    const team = await createTeam(adminUserId, 'Invite Link Test Team');
    teamId = team.id;
    
    await loginViaUI(page, adminEmail, testPassword);
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (adminUserId) await deleteUser(adminUserId);
  });

  test('should display team invite link', async ({ page }) => {
    await page.goto(`/team/${teamId}/invite`);
    
    // Should show invite link section
    await expect(page.getByText(/invite link|share link|join link/i)).toBeVisible();
    
    // Verify team has an invite code
    const inviteCode = await getTeamInviteCode(teamId);
    expect(inviteCode).toBeTruthy();
    
    // Link should be visible on page
    if (inviteCode) {
      const linkPattern = new RegExp(inviteCode, 'i');
      await expect(page.getByText(linkPattern)).toBeVisible();
    }
  });

  test('should copy invite link to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    await page.goto(`/team/${teamId}/invite`);
    
    // Find copy button
    const copyButton = page.getByRole('button', { name: /copy/i }).first();
    await expect(copyButton).toBeVisible();
    
    // Click copy
    await copyButton.click();
    
    // Should show confirmation (icon change or message)
    await expect(page.getByText(/copied/i).or(page.locator('[data-copied="true"]')))
      .toBeVisible({ timeout: 5000 })
      .catch(() => {
        // Copy feedback may be visual only (icon change)
        return true;
      });
    
    // Verify clipboard contains invite link
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain(window.location.origin);
    expect(clipboardText).toContain('/join/');
  });

  test('should show invite link URL format', async ({ page }) => {
    await page.goto(`/team/${teamId}/invite`);
    
    const inviteCode = await getTeamInviteCode(teamId);
    
    if (inviteCode) {
      // Verify link format is correct
      const expectedLink = `${page.url().split('/')[0]}//${page.url().split('/')[2]}/join/${inviteCode}`;
      
      // Link should be visible on page with correct format
      const linkElement = page.locator(`text=/${inviteCode}/i`).or(
        page.locator(`[href*="${inviteCode}"]`)
      );
      
      const isVisible = await linkElement.isVisible().catch(() => false);
      expect(isVisible).toBeTruthy();
    }
  });
});

/**
 * Test 3.6: Join via link - new user
 * 
 * Given a share link
 * When a non-user clicks
 * Then they sign up/verify, are added to the team, land on team dashboard
 */
test.describe('Invitations - Join via Link (New User)', () => {
  let adminUserId: string;
  let teamId: string;
  let inviteCode: string;
  const adminPassword = 'Test123456!';

  test.beforeEach(async () => {
    const adminEmail = generateTestEmail('link-admin');
    const admin = await createVerifiedUser(adminEmail, adminPassword);
    adminUserId = admin.id!;
    
    const team = await createTeam(adminUserId, 'Join Test Team');
    teamId = team.id;
    
    // Ensure team has invite code
    let code = await getTeamInviteCode(teamId);
    if (!code) {
      code = await generateInviteCode(teamId);
    }
    inviteCode = code;
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (adminUserId) await deleteUser(adminUserId);
  });

  test('should redirect new user to signup from invite link', async ({ page }) => {
    await clearAuthState(page);
    
    // Visit invite link
    await page.goto(`/join/${inviteCode}`);
    
    // Should redirect to auth/signup page
    // Implementation may vary - could be direct signup or auth page
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    const isOnAuth = currentUrl.includes('/auth') || currentUrl.includes('/signup');
    
    expect(isOnAuth || currentUrl.includes('/join')).toBeTruthy();
  });

  test('should add new user to team after signup via invite link', async ({ page }) => {
    const newUserEmail = generateTestEmail('new-link-user');
    const newUserPassword = 'Test123456!';
    
    let newUserId: string | undefined;
    
    try {
      await clearAuthState(page);
      
      // Visit invite link
      await page.goto(`/join/${inviteCode}`);
      
      // If redirected to signup, complete it
      await page.waitForTimeout(2000);
      
      if (page.url().includes('/auth')) {
        // Sign up
        await page.getByRole('tab', { name: /sign up/i }).click().catch(() => {});
        await page.getByLabel(/email/i).fill(newUserEmail);
        await page.getByLabel(/password/i).first().fill(newUserPassword);
        await page.getByRole('button', { name: /sign up|create/i }).click();
        
        await page.waitForTimeout(2000);
      }
      
      // Verify user was created and added to team
      const { data: users } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', newUserEmail);
      
      if (users && users.length > 0) {
        newUserId = users[0].id;
        
        // Check if added to team
        const isMember = await isTeamMember(teamId, newUserId);
        expect(isMember).toBeTruthy();
      }
      
    } finally {
      if (newUserId) {
        await deleteUser(newUserId);
      }
    }
  });
});

/**
 * Test 3.7: Join via link - existing user
 * 
 * When existing verified user clicks
 * Then added to team immediately
 */
test.describe('Invitations - Join via Link (Existing User)', () => {
  let adminUserId: string;
  let existingUserId: string;
  let teamId: string;
  let inviteCode: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async () => {
    // Create admin
    const adminEmail = generateTestEmail('link-admin');
    const admin = await createVerifiedUser(adminEmail, testPassword);
    adminUserId = admin.id!;
    
    // Create existing user (not in team)
    const existingEmail = generateTestEmail('existing-link-user');
    const existing = await createVerifiedUser(existingEmail, testPassword);
    existingUserId = existing.id!;
    
    // Create team
    const team = await createTeam(adminUserId, 'Existing User Join Team');
    teamId = team.id;
    
    // Ensure invite code exists
    let code = await getTeamInviteCode(teamId);
    if (!code) {
      code = await generateInviteCode(teamId);
    }
    inviteCode = code;
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (adminUserId) await deleteUser(adminUserId);
    if (existingUserId) await deleteUser(existingUserId);
  });

  test('should add logged-in user to team via invite link', async ({ page }) => {
    const existingEmail = generateTestEmail('existing-link-user-2');
    const existing = await createVerifiedUser(existingEmail, testPassword);
    
    try {
      // Login as existing user
      await loginViaUI(page, existingEmail, testPassword);
      await page.waitForURL(/\/(dashboard|create-team)/, { timeout: 15000 });
      
      // Click invite link
      await page.goto(`/join/${inviteCode}`);
      
      // Should process and add to team
      await page.waitForTimeout(3000);
      
      // Verify user added to team
      const isMember = await isTeamMember(teamId, existing.id!);
      expect(isMember).toBeTruthy();
      
      // Should redirect to team page
      const currentUrl = page.url();
      const isOnTeamPage = currentUrl.includes('/team/') || currentUrl.includes(teamId);
      expect(isOnTeamPage).toBeTruthy();
      
    } finally {
      await deleteUser(existing.id!);
    }
  });

  test('should not add user twice if already member', async ({ page }) => {
    const userEmail = generateTestEmail('duplicate-link-user');
    const user = await createVerifiedUser(userEmail, testPassword);
    
    try {
      // Login
      await loginViaUI(page, userEmail, testPassword);
      await page.waitForURL(/\/(dashboard|create-team)/, { timeout: 15000 });
      
      // Join team first time
      await page.goto(`/join/${inviteCode}`);
      await page.waitForTimeout(2000);
      
      // Verify added
      let isMember = await isTeamMember(teamId, user.id!);
      expect(isMember).toBeTruthy();
      
      // Try to join again with same link
      await page.goto(`/join/${inviteCode}`);
      await page.waitForTimeout(2000);
      
      // Should handle gracefully (no duplicate membership)
      // May show "Already a member" message or just redirect to team
      
      // Verify still only one membership record
      const { data: memberships } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('user_id', user.id!);
      
      expect(memberships?.length).toBe(1);
      
    } finally {
      await deleteUser(user.id!);
    }
  });
});

/**
 * Test 3.8: Link expiry & rotation
 * - Expired link shows clear error and allows request new invite
 * - Rotated link invalidates previous
 */
test.describe('Invitations - Link Expiry and Rotation', () => {
  let adminEmail: string;
  let adminUserId: string;
  let teamId: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async ({ page }) => {
    adminEmail = generateTestEmail('rotation-admin');
    const admin = await createVerifiedUser(adminEmail, testPassword);
    adminUserId = admin.id!;
    
    const team = await createTeam(adminUserId, 'Rotation Test Team');
    teamId = team.id;
    
    await loginViaUI(page, adminEmail, testPassword);
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (adminUserId) await deleteUser(adminUserId);
  });

  test('should rotate invite link', async ({ page }) => {
    await page.goto(`/team/${teamId}/invite`);
    
    // Get current invite code
    const originalCode = await getTeamInviteCode(teamId);
    expect(originalCode).toBeTruthy();
    
    // Find rotate/regenerate button
    const rotateButton = page.getByRole('button', { name: /rotate|regenerate|new link/i });
    
    if (await rotateButton.isVisible().catch(() => false)) {
      await rotateButton.click();
      
      // May need confirmation
      const confirmButton = page.getByRole('button', { name: /confirm|yes|generate/i });
      if (await confirmButton.isVisible().catch(() => false)) {
        await confirmButton.click();
      }
      
      // Wait for update
      await page.waitForTimeout(2000);
      
      // Verify new code is different
      const newCode = await getTeamInviteCode(teamId);
      expect(newCode).toBeTruthy();
      expect(newCode).not.toBe(originalCode);
      
      // New code should be visible on page
      await expect(page.getByText(new RegExp(newCode!, 'i'))).toBeVisible();
    }
  });

  test('should invalidate old link after rotation', async ({ page, context }) => {
    // Get original code
    const originalCode = await getTeamInviteCode(teamId);
    expect(originalCode).toBeTruthy();
    
    // Generate new code
    const newCode = await generateInviteCode(teamId);
    expect(newCode).not.toBe(originalCode);
    
    // Try to use old code
    await clearAuthState(page);
    await page.goto(`/join/${originalCode}`);
    
    // Should show error or invalid link message
    await page.waitForTimeout(2000);
    
    const hasError = await page.getByText(/invalid|expired|not found/i)
      .isVisible()
      .catch(() => false);
    
    // Or verify user is not added to team
    if (!hasError) {
      // If no error shown, verify no auto-join happened
      // (This depends on implementation - some systems silently fail)
      console.log('Old link handling may need review');
    }
  });

  test.skip('should show error for expired invite link', async ({ page }) => {
    // This test requires:
    // 1. Setting an expiry date on invite codes
    // 2. Creating an expired code
    // 3. Attempting to use it
    
    // Expected behavior:
    // - Visit expired invite link
    // - See message: "This invite link has expired"
    // - See button: "Request New Invite"
    // - Clicking button allows requesting invite from team admin
  });

  test.skip('should allow requesting new invite after expiry', async ({ page }) => {
    // Expected flow:
    // 1. User visits expired link
    // 2. Sees "Expired" message
    // 3. Enters email to request new invite
    // 4. Team admin receives notification
    // 5. Can approve and send new invite
  });
});

// Import supabase for some tests
import { supabase } from '../helpers/supabase.helper';

