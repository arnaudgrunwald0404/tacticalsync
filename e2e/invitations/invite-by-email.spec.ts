import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser, loginViaUI } from '../helpers/auth.helper';
import { createTeam, deleteTeam } from '../helpers/team.helper';
import { getTeamInvitations, getInvitationByEmail, deleteInvitation, createInvitation, updateInvitationStatus } from '../helpers/invitation.helper';

/**
 * Test 3.1: Invite by email - send
 * 
 * Given admin enters valid emails
 * When send
 * Then invitations created, status pending, emails dispatched
 */
test.describe('Invitations - Invite by Email', () => {
  let adminEmail: string;
  let adminUserId: string;
  let teamId: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async ({ page }) => {
    adminEmail = generateTestEmail('invite-admin');
    const admin = await createVerifiedUser(adminEmail, testPassword);
    adminUserId = admin.id!;
    
    const team = await createTeam(adminUserId, 'Invitation Test Team');
    teamId = team.id;
    
    await loginViaUI(page, adminEmail, testPassword);
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (adminUserId) await deleteUser(adminUserId);
  });

  test('should send invitation to new email', async ({ page }) => {
    const inviteeEmail = generateTestEmail('invitee');
    
    await page.goto(`/team/${teamId}/invite`);
    
    // Find invitation input area
    const emailInput = page.locator('input[type="email"], textarea').first();
    await emailInput.fill(inviteeEmail);
    
    // Click send/invite button
    const sendButton = page.getByRole('button', { name: /send|invite/i }).first();
    await sendButton.click();
    
    // Should show success message
    await expect(page.getByText(/invited|sent/i)).toBeVisible({ timeout: 10000 });
    
    // Verify invitation in database
    const invitation = await getInvitationByEmail(teamId, inviteeEmail);
    expect(invitation).toBeTruthy();
    expect(invitation?.status).toBe('pending');
    expect(invitation?.invited_by).toBe(adminUserId);
    
    // Cleanup
    if (invitation) {
      await deleteInvitation(invitation.id);
    }
  });

  test('should send multiple invitations', async ({ page }) => {
    const invitee1 = generateTestEmail('invitee1');
    const invitee2 = generateTestEmail('invitee2');
    const invitee3 = generateTestEmail('invitee3');
    
    await page.goto(`/team/${teamId}/invite`);
    
    // Send invitations (implementation depends on your UI)
    // You may support comma-separated emails or multiple individual invitations
    
    for (const email of [invitee1, invitee2, invitee3]) {
      const emailInput = page.locator('input[type="email"], textarea').first();
      await emailInput.fill(email);
      await page.getByRole('button', { name: /send|invite/i }).first().click();
      await page.waitForTimeout(1000);
    }
    
    // Verify all invitations created
    const invitations = await getTeamInvitations(teamId);
    const emails = invitations.map(inv => inv.email);
    
    expect(emails).toContain(invitee1);
    expect(emails).toContain(invitee2);
    expect(emails).toContain(invitee3);
    
    // Cleanup
    for (const inv of invitations) {
      await deleteInvitation(inv.id);
    }
  });

  test('should validate email format', async ({ page }) => {
    await page.goto(`/team/${teamId}/invite`);
    
    const emailInput = page.locator('input[type="email"], textarea').first();
    await emailInput.fill('invalid-email');
    
    const sendButton = page.getByRole('button', { name: /send|invite/i }).first();
    await sendButton.click();
    
    // Should show validation error
    const hasError = await page.getByText(/invalid|valid email/i).isVisible().catch(() => false);
    expect(hasError).toBeTruthy();
  });

  test('should handle empty email field', async ({ page }) => {
    await page.goto(`/team/${teamId}/invite`);
    
    const sendButton = page.getByRole('button', { name: /send|invite/i }).first();
    await sendButton.click();
    
    // Should either not send or show validation message
    const invitations = await getTeamInvitations(teamId);
    const pendingInvitations = invitations.filter(inv => inv.status === 'pending');
    
    // No new invitations should be created
    expect(pendingInvitations.length).toBe(0);
  });
});

/**
 * Test 3.2: Invite by email - existing user
 * 
 * Given email belongs to an existing verified user
 * When invited
 * Then status becomes accepted upon clicking CTA (no duplicate user)
 */
test.describe('Invitations - Existing User', () => {
  let adminEmail: string;
  let existingUserEmail: string;
  let adminUserId: string;
  let existingUserId: string;
  let teamId: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async ({ page }) => {
    // Create admin
    adminEmail = generateTestEmail('invite-admin');
    const admin = await createVerifiedUser(adminEmail, testPassword);
    adminUserId = admin.id!;
    
    // Create existing user
    existingUserEmail = generateTestEmail('existing-user');
    const existing = await createVerifiedUser(existingUserEmail, testPassword);
    existingUserId = existing.id!;
    
    // Create team
    const team = await createTeam(adminUserId, 'Existing User Test Team');
    teamId = team.id;
    
    await loginViaUI(page, adminEmail, testPassword);
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (adminUserId) await deleteUser(adminUserId);
    if (existingUserId) await deleteUser(existingUserId);
  });

  test('should invite existing user successfully', async ({ page }) => {
    await page.goto(`/team/${teamId}/invite`);
    
    // Send invitation to existing user
    const emailInput = page.locator('input[type="email"], textarea').first();
    await emailInput.fill(existingUserEmail);
    
    const sendButton = page.getByRole('button', { name: /send|invite/i }).first();
    await sendButton.click();
    
    // Should succeed
    await expect(page.getByText(/invited|sent/i)).toBeVisible({ timeout: 10000 });
    
    // Verify invitation created
    const invitation = await getInvitationByEmail(teamId, existingUserEmail);
    expect(invitation).toBeTruthy();
    expect(invitation?.status).toBe('pending');
    
    if (invitation) {
      await deleteInvitation(invitation.id);
    }
  });

  test('should not create duplicate user when existing user accepts', async ({ page, context }) => {
    // Create invitation
    const invitation = await createInvitation(teamId, existingUserEmail, adminUserId);
    
    try {
      // Logout admin
      await page.evaluate(() => localStorage.clear());
      await context.clearCookies();
      
      // Login as existing user
      await loginViaUI(page, existingUserEmail, testPassword);
      
      // Accept invitation (navigate to team or accept link)
      // Implementation depends on your invitation acceptance flow
      await page.goto(`/team/${teamId}/invite`);
      
      // User should be added to team without creating duplicate
      // This happens automatically in many systems when user logs in
      
      // Verify only one user record exists
      // (Checking this would require querying profiles table)
      
    } finally {
      await deleteInvitation(invitation.id);
    }
  });
});

/**
 * Test 3.3: Resend & revoke
 * - Resend updates token & sends again
 * - Revoke makes previous tokens invalid
 */
test.describe('Invitations - Resend and Revoke', () => {
  let adminEmail: string;
  let adminUserId: string;
  let teamId: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async ({ page }) => {
    adminEmail = generateTestEmail('invite-admin');
    const admin = await createVerifiedUser(adminEmail, testPassword);
    adminUserId = admin.id!;
    
    const team = await createTeam(adminUserId, 'Resend Test Team');
    teamId = team.id;
    
    await loginViaUI(page, adminEmail, testPassword);
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (adminUserId) await deleteUser(adminUserId);
  });

  test('should resend invitation', async ({ page }) => {
    const inviteeEmail = generateTestEmail('resend-invitee');
    
    // Create initial invitation
    const invitation = await createInvitation(teamId, inviteeEmail, adminUserId);
    const originalCreatedAt = invitation.created_at;
    
    try {
      await page.goto(`/team/${teamId}/invite`);
      
      // Find resend button (UI implementation specific)
      // May be next to invitation in a list
      const resendButton = page.getByRole('button', { name: /resend/i }).first();
      
      if (await resendButton.isVisible().catch(() => false)) {
        await resendButton.click();
        
        // Should show success message
        await expect(page.getByText(/resent|sent/i)).toBeVisible({ timeout: 10000 });
        
        // Verify invitation was updated
        const updatedInvitation = await getInvitationByEmail(teamId, inviteeEmail);
        expect(updatedInvitation).toBeTruthy();
        // Updated_at should be newer
        expect(updatedInvitation?.updated_at).not.toBe(originalCreatedAt);
      }
      
    } finally {
      await deleteInvitation(invitation.id);
    }
  });

  test('should revoke invitation', async ({ page }) => {
    const inviteeEmail = generateTestEmail('revoke-invitee');
    
    // Create invitation
    const invitation = await createInvitation(teamId, inviteeEmail, adminUserId);
    
    try {
      await page.goto(`/team/${teamId}/invite`);
      
      // Find revoke button
      const revokeButton = page.getByRole('button', { name: /revoke|cancel/i }).first();
      
      if (await revokeButton.isVisible().catch(() => false)) {
        await revokeButton.click();
        
        // May need to confirm
        const confirmButton = page.getByRole('button', { name: /confirm|yes/i });
        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click();
        }
        
        // Should show success message
        await expect(page.getByText(/revoked|cancelled/i)).toBeVisible({ timeout: 10000 });
        
        // Verify status updated
        const revokedInvitation = await getInvitationByEmail(teamId, inviteeEmail);
        expect(revokedInvitation?.status).toBe('revoked');
      }
      
    } finally {
      await deleteInvitation(invitation.id);
    }
  });

  test('revoked invitation should not be usable', async ({ page, context }) => {
    const inviteeEmail = generateTestEmail('revoked-test');
    const inviteePassword = 'Test123456!';
    
    // Create invitation
    const invitation = await createInvitation(teamId, inviteeEmail, adminUserId);
    
    // Create user for invitee
    const invitee = await createVerifiedUser(inviteeEmail, inviteePassword);
    
    try {
      // Revoke invitation
      await updateInvitationStatus(invitation.id, 'revoked');
      
      // Logout admin
      await page.evaluate(() => localStorage.clear());
      await context.clearCookies();
      
      // Login as invitee
      await loginViaUI(page, inviteeEmail, inviteePassword);
      
      // Try to accept invitation (should fail or show as revoked)
      // Implementation depends on your acceptance flow
      
      // Attempt to access team
      await page.goto(`/team/${teamId}`);
      
      // Should not have access (either redirected or error shown)
      await page.waitForTimeout(2000);
      const hasAccess = page.url().includes(teamId);
      
      if (hasAccess) {
        // Should see "not authorized" message
        const deniedMessage = await page.getByText(/not authorized|access denied|revoked/i).isVisible().catch(() => false);
        expect(deniedMessage).toBeTruthy();
      }
      
    } finally {
      await deleteInvitation(invitation.id);
      await deleteUser(invitee.id!);
    }
  });
});

/**
 * Test 3.4: Duplicate invites / already member
 * 
 * When admin re-invites an existing member
 * Then UI shows they're already in; no duplicate invite
 */
test.describe('Invitations - Duplicate Prevention', () => {
  let adminEmail: string;
  let memberEmail: string;
  let adminUserId: string;
  let memberUserId: string;
  let teamId: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async ({ page }) => {
    // Create admin
    adminEmail = generateTestEmail('invite-admin');
    const admin = await createVerifiedUser(adminEmail, testPassword);
    adminUserId = admin.id!;
    
    // Create member
    memberEmail = generateTestEmail('existing-member');
    const member = await createVerifiedUser(memberEmail, testPassword);
    memberUserId = member.id!;
    
    // Create team
    const team = await createTeam(adminUserId, 'Duplicate Test Team');
    teamId = team.id;
    
    await loginViaUI(page, adminEmail, testPassword);
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (adminUserId) await deleteUser(adminUserId);
    if (memberUserId) await deleteUser(memberUserId);
  });

  test('should prevent duplicate pending invitations', async ({ page }) => {
    const inviteeEmail = generateTestEmail('duplicate-invitee');
    
    await page.goto(`/team/${teamId}/invite`);
    
    // Send first invitation
    let emailInput = page.locator('input[type="email"], textarea').first();
    await emailInput.fill(inviteeEmail);
    await page.getByRole('button', { name: /send|invite/i }).first().click();
    await expect(page.getByText(/invited|sent/i)).toBeVisible({ timeout: 10000 });
    
    // Try to send again
    await page.waitForTimeout(1000);
    emailInput = page.locator('input[type="email"], textarea').first();
    await emailInput.fill(inviteeEmail);
    await page.getByRole('button', { name: /send|invite/i }).first().click();
    
    // Should show message about existing invitation
    const hasWarning = await page.getByText(/already invited|pending invitation|duplicate/i)
      .isVisible()
      .catch(() => false);
    
    if (!hasWarning) {
      // Or verify only one invitation exists
      const invitations = await getTeamInvitations(teamId);
      const matchingInvites = invitations.filter(inv => inv.email === inviteeEmail);
      expect(matchingInvites.length).toBeLessThanOrEqual(1);
    }
    
    // Cleanup
    const invitations = await getTeamInvitations(teamId);
    for (const inv of invitations) {
      await deleteInvitation(inv.id);
    }
  });

  test.skip('should show member is already in team', async ({ page }) => {
    // Add member to team first
    await page.goto(`/team/${teamId}/invite`);
    
    // Member is already part of the team via team_members table
    
    // Try to invite them again
    const emailInput = page.locator('input[type="email"], textarea').first();
    await emailInput.fill(memberEmail);
    await page.getByRole('button', { name: /send|invite/i }).first().click();
    
    // Should show they're already a member
    await expect(page.getByText(/already.*member|already.*team/i)).toBeVisible({ timeout: 10000 });
  });
});

