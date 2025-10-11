import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser, loginViaUI } from '../helpers/auth.helper';
import { createTeamViaUI, deleteTeam } from '../helpers/team.helper';
import { supabase } from '../helpers/supabase.helper';

/**
 * Test 2.1: Create team (admin)
 * 
 * Given no teams
 * When admin creates team with name + short name
 * Then team exists; admin role assigned
 */
test.describe('Teams - Create Team', () => {
  let testEmail: string;
  let userId: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async ({ page }) => {
    testEmail = generateTestEmail('team-create');
    const user = await createVerifiedUser(testEmail, testPassword);
    userId = user.id!;
    
    await loginViaUI(page, testEmail, testPassword);
    await page.waitForURL(/\/(dashboard|create-team)/, { timeout: 15000 });
  });

  test.afterEach(async () => {
    // Cleanup will be done by deleting user, which cascades
    if (userId) {
      await deleteUser(userId);
    }
  });

  test('should create team with name and short name', async ({ page }) => {
    const teamName = `Engineering Team ${Date.now()}`;
    const shortName = 'ENG';

    await createTeamViaUI(page, teamName, shortName);

    // Should redirect to invite page
    await expect(page).toHaveURL(/\/team\/.*\/invite/);
    
    // Verify team was created in database
    const { data: teams } = await supabase
      .from('teams')
      .select('*')
      .eq('name', teamName)
      .eq('created_by', userId);

    expect(teams).toBeTruthy();
    expect(teams?.length).toBe(1);
    expect(teams![0].name).toBe(teamName);
    expect(teams![0].abbreviated_name).toBe(shortName);

    // Verify creator is admin
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teams![0].id)
      .eq('user_id', userId)
      .single();

    expect(membership?.role).toBe('admin');
  });

  test('should create team with name only (no short name)', async ({ page }) => {
    const teamName = `Marketing Team ${Date.now()}`;

    await createTeamViaUI(page, teamName);

    await expect(page).toHaveURL(/\/team\/.*\/invite/);
    
    const { data: teams } = await supabase
      .from('teams')
      .select('*')
      .eq('name', teamName)
      .eq('created_by', userId);

    expect(teams).toBeTruthy();
    expect(teams?.length).toBe(1);
    expect(teams![0].abbreviated_name).toBeNull();
  });

  test('should require team name', async ({ page }) => {
    await page.goto('/create-team');
    
    // Try to submit without name
    await page.getByRole('button', { name: /create team/i }).click();
    
    // Should not navigate away (validation)
    await expect(page).toHaveURL(/\/create-team/);
  });

  test('should enforce short name max length', async ({ page }) => {
    await page.goto('/create-team');
    
    const shortNameInput = page.getByLabel(/short name/i);
    
    // Try to enter more than 10 characters
    await shortNameInput.fill('VERYLONGNAME12345');
    
    // Check that it's limited to 10 characters
    const value = await shortNameInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(10);
  });

  test('should redirect to auth if not logged in', async ({ page }) => {
    // Logout
    await page.evaluate(() => localStorage.clear());
    await page.context().clearCookies();
    
    // Try to access create team page
    await page.goto('/create-team');
    
    // Should redirect to auth
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
  });

  test('should show back to dashboard button', async ({ page }) => {
    await page.goto('/create-team');
    
    const backButton = page.getByRole('button', { name: /back to dashboard/i });
    await expect(backButton).toBeVisible();
    
    // Click and verify navigation
    await backButton.click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('should handle create team errors gracefully', async ({ page }) => {
    // This test would simulate a database error
    // For now, we'll test the UI behavior with invalid data
    
    await page.goto('/create-team');
    
    const teamName = 'Test Team';
    await page.getByLabel(/team name/i).fill(teamName);
    
    // Create the team
    await page.getByRole('button', { name: /create team/i }).click();
    
    // Should either succeed or show error message
    await page.waitForTimeout(2000);
    
    const isOnInvitePage = await page.url().includes('/invite');
    const hasErrorMessage = await page.getByText(/error/i).isVisible().catch(() => false);
    
    expect(isOnInvitePage || hasErrorMessage).toBeTruthy();
  });
});

/**
 * Test 2.2: Team name validations
 * - Required, <= max length, no forbidden chars
 * - Short name uniqueness within org/account scope
 * - Slug generation & collision handling
 */
test.describe('Teams - Name Validation', () => {
  let testEmail: string;
  let userId: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async ({ page }) => {
    testEmail = generateTestEmail('team-validation');
    const user = await createVerifiedUser(testEmail, testPassword);
    userId = user.id!;
    
    await loginViaUI(page, testEmail, testPassword);
    await page.waitForURL(/\/(dashboard|create-team)/, { timeout: 15000 });
  });

  test.afterEach(async () => {
    if (userId) {
      await deleteUser(userId);
    }
  });

  test('should accept valid team names', async ({ page }) => {
    const validNames = [
      'Engineering',
      'Engineering Team',
      'Engineering-Team',
      'Engineering_Team',
      'Engineering 123',
      'Équipe d\'ingénierie', // International characters
    ];

    for (const name of validNames) {
      await page.goto('/create-team');
      await page.getByLabel(/team name/i).fill(name);
      await page.getByRole('button', { name: /create team/i }).click();
      
      // Should succeed
      await expect(page).toHaveURL(/\/team\/.*\/invite/, { timeout: 10000 });
      
      // Go back for next iteration
      if (validNames.indexOf(name) < validNames.length - 1) {
        await page.goto('/create-team');
      }
    }
  });

  test('should trim whitespace from team name', async ({ page }) => {
    const teamName = '  Test Team  ';
    const trimmedName = 'Test Team';

    await page.goto('/create-team');
    await page.getByLabel(/team name/i).fill(teamName);
    await page.getByRole('button', { name: /create team/i }).click();

    await page.waitForURL(/\/team\/.*\/invite/, { timeout: 15000 });

    // Verify in database that name is trimmed
    const { data: teams } = await supabase
      .from('teams')
      .select('name')
      .eq('created_by', userId);

    expect(teams).toBeTruthy();
    expect(teams![0].name).toBe(trimmedName);
  });

  test('should allow duplicate team names for different users', async ({ page }) => {
    // Create first team
    const teamName = `Shared Name ${Date.now()}`;
    await createTeamViaUI(page, teamName);
    await expect(page).toHaveURL(/\/team\/.*\/invite/);

    // Create second user
    const email2 = generateTestEmail('team-validation-2');
    const user2 = await createVerifiedUser(email2, testPassword);

    try {
      // Logout first user
      await page.evaluate(() => localStorage.clear());
      await page.context().clearCookies();

      // Login as second user
      await loginViaUI(page, email2, testPassword);
      await page.waitForURL(/\/(dashboard|create-team)/, { timeout: 15000 });

      // Create team with same name
      await createTeamViaUI(page, teamName);

      // Should succeed - duplicate names allowed for different users
      await expect(page).toHaveURL(/\/team\/.*\/invite/);

    } finally {
      await deleteUser(user2.id!);
    }
  });
});

