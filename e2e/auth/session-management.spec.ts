import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser, loginViaUI } from '../helpers/auth.helper';

/**
 * Test 1.11: Session expiry / refresh
 * 
 * Given a valid session
 * When token expires mid-session
 * Then silent refresh (if enabled) or redirect to login preserving the intended route
 */
test.describe('Session Management', () => {
  
  test('should maintain session across page reloads', async ({ page }) => {
    const testEmail = generateTestEmail('session');
    const testPassword = 'Test123456!';
    const user = await createVerifiedUser(testEmail, testPassword);

    try {
      // Login
      await loginViaUI(page, testEmail, testPassword);
      
      // Wait for successful login
      await expect(page).toHaveURL(/\/(dashboard|create-team)/, { timeout: 15000 });
      
      // Reload the page
      await page.reload();
      
      // Should still be logged in
      await expect(page).toHaveURL(/\/(dashboard|create-team)/, { timeout: 10000 });
      
      // Should not redirect to auth page
      await expect(page).not.toHaveURL(/\/auth/);
      
    } finally {
      if (user.id) {
        await deleteUser(user.id);
      }
    }
  });

  test('should maintain session across navigation', async ({ page }) => {
    const testEmail = generateTestEmail('session-nav');
    const testPassword = 'Test123456!';
    const user = await createVerifiedUser(testEmail, testPassword);

    try {
      // Login
      await loginViaUI(page, testEmail, testPassword);
      await expect(page).toHaveURL(/\/(dashboard|create-team)/, { timeout: 15000 });
      
      // Navigate to different pages
      await page.goto('/profile');
      await page.waitForTimeout(1000);
      
      // Should still be logged in (not redirected to auth)
      await expect(page).toHaveURL(/\/profile/);
      
      // Navigate to settings
      await page.goto('/settings');
      await page.waitForTimeout(1000);
      
      // Should still be logged in
      await expect(page).toHaveURL(/\/settings/);
      
    } finally {
      if (user.id) {
        await deleteUser(user.id);
      }
    }
  });

  test.skip('should handle session expiry gracefully', async ({ page }) => {
    // This test requires:
    // 1. Creating a session
    // 2. Manipulating token expiry time
    // 3. Triggering an action after expiry
    // 4. Verifying behavior (refresh or redirect)
    
    // Expected behavior with auto-refresh enabled:
    // - Session token expires
    // - Next API call triggers refresh
    // - New token obtained silently
    // - User continues without interruption
    
    // Expected behavior without auto-refresh:
    // - Session token expires
    // - Next API call fails
    // - User redirected to login
    // - After login, redirected back to intended page
  });

  test.skip('should redirect to login after logout', async ({ page }) => {
    const testEmail = generateTestEmail('logout');
    const testPassword = 'Test123456!';
    const user = await createVerifiedUser(testEmail, testPassword);

    try {
      // Login
      await loginViaUI(page, testEmail, testPassword);
      await expect(page).toHaveURL(/\/(dashboard|create-team)/, { timeout: 15000 });
      
      // Logout
      await page.goto('/settings');
      const logoutButton = page.getByRole('button', { name: /log out|sign out/i });
      await logoutButton.click();
      
      // Should redirect to auth page
      await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
      
      // Try to access protected page
      await page.goto('/dashboard');
      
      // Should redirect back to auth
      await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
      
    } finally {
      if (user.id) {
        await deleteUser(user.id);
      }
    }
  });

  test('should protect routes requiring authentication', async ({ page }) => {
    // Try to access protected routes without logging in
    const protectedRoutes = [
      '/dashboard',
      '/create-team',
      '/settings',
      '/profile'
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      
      // Should redirect to auth page
      await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
    }
  });

  test.skip('should preserve intended route after login', async ({ page }) => {
    // This test verifies the "redirect after login" flow
    
    // Expected flow:
    // 1. User tries to access /dashboard (not logged in)
    // 2. Redirected to /auth
    // 3. User logs in
    // 4. Redirected back to /dashboard (not just any default page)
    
    const testEmail = generateTestEmail('redirect');
    const testPassword = 'Test123456!';
    const user = await createVerifiedUser(testEmail, testPassword);

    try {
      // Try to access dashboard
      await page.goto('/dashboard');
      
      // Should redirect to auth
      await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
      
      // Login
      await page.getByLabel(/email/i).fill(testEmail);
      await page.getByLabel(/password/i).fill(testPassword);
      await page.getByRole('button', { name: /sign in/i }).click();
      
      // Should redirect back to originally requested page
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
      
    } finally {
      if (user.id) {
        await deleteUser(user.id);
      }
    }
  });

  test.skip('should handle concurrent sessions in different tabs', async ({ browser }) => {
    // This test verifies behavior with multiple tabs/sessions
    
    // Test scenarios:
    // 1. Login in tab A, verify session in tab B
    // 2. Logout in tab A, verify tab B also logged out
    // 3. Session refresh in tab A propagates to tab B
    
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    
    const testEmail = generateTestEmail('concurrent');
    const testPassword = 'Test123456!';
    const user = await createVerifiedUser(testEmail, testPassword);

    try {
      // Login in first tab
      await loginViaUI(page1, testEmail, testPassword);
      await expect(page1).toHaveURL(/\/(dashboard|create-team)/, { timeout: 15000 });
      
      // Navigate to dashboard in second tab
      await page2.goto('/dashboard');
      
      // Should be logged in (shared session)
      await expect(page2).toHaveURL(/\/dashboard/, { timeout: 10000 });
      
      // Logout in first tab
      await page1.goto('/settings');
      await page1.getByRole('button', { name: /log out|sign out/i }).click();
      
      // Reload second tab
      await page2.reload();
      
      // Should also be logged out
      await expect(page2).toHaveURL(/\/auth/, { timeout: 10000 });
      
    } finally {
      if (user.id) {
        await deleteUser(user.id);
      }
      await context.close();
    }
  });
});

