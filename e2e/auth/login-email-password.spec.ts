import { test, expect } from '@playwright/test';
import { generateTestEmail, clearAuthState, createVerifiedUser, deleteUser, loginViaUI } from '../helpers/auth.helper';

/**
 * Test 1.5: Login - email + password
 * 
 * Given a verified user
 * When they submit correct credentials
 * Then they're redirected to dashboard (or team creation if none exists)
 */
test.describe('Authentication - Login with Email & Password', () => {
  let testEmail: string;
  const testPassword = 'Test123456!';
  let userId: string;

  test.beforeEach(async ({ page }) => {
    testEmail = generateTestEmail('login');
    
    // Create a verified user
    const user = await createVerifiedUser(testEmail, testPassword);
    userId = user.id!;
    
    await clearAuthState(page);
  });

  test.afterEach(async () => {
    if (userId) {
      await deleteUser(userId);
    }
  });

  test('should login with correct credentials and redirect', async ({ page }) => {
    await page.goto('/auth');
    
    // Make sure we're on sign in tab
    await page.getByRole('tab', { name: /sign in/i }).click();
    
    // Enter credentials
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill(testPassword);
    
    // Submit
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should show success message
    await expect(page.getByText(/signed in successfully/i)).toBeVisible({ timeout: 10000 });
    
    // Should redirect to dashboard or team creation
    await expect(page).toHaveURL(/\/(dashboard|create-team)/, { timeout: 15000 });
  });

  test('should show error for incorrect password', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('tab', { name: /sign in/i }).click();
    
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill('WrongPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should show error
    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible({ timeout: 10000 });
    
    // Should stay on auth page
    await expect(page).toHaveURL(/\/auth/);
  });

  test('should show error for non-existent email', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('tab', { name: /sign in/i }).click();
    
    const nonExistentEmail = generateTestEmail('nonexistent');
    await page.getByLabel(/email/i).fill(nonExistentEmail);
    await page.getByLabel(/password/i).fill(testPassword);
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should show error
    await expect(page.getByText(/invalid|not found|doesn't exist/i)).toBeVisible({ timeout: 10000 });
  });

  test('should validate email format on login', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('tab', { name: /sign in/i }).click();
    
    await page.getByLabel(/email/i).fill('not-an-email');
    await page.getByLabel(/password/i).fill(testPassword);
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should show validation error
    await expect(page.getByText(/valid email/i)).toBeVisible();
  });

  test('should require both email and password for login', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('tab', { name: /sign in/i }).click();
    
    // Try to submit without filling anything
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should show validation
    await expect(page.getByText(/enter email and password/i)).toBeVisible();
  });

  test('should redirect to dashboard if already logged in', async ({ page }) => {
    // First, login
    await loginViaUI(page, testEmail, testPassword);
    
    // Wait for redirect
    await expect(page).toHaveURL(/\/(dashboard|create-team)/, { timeout: 15000 });
    
    // Now try to navigate back to auth page
    await page.goto('/auth');
    
    // Should immediately redirect back to dashboard
    await expect(page).toHaveURL(/\/(dashboard|create-team)/, { timeout: 10000 });
  });
});

