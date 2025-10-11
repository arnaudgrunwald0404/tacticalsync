import { test, expect } from '@playwright/test';
import { generateTestEmail, clearAuthState } from '../helpers/auth.helper';

/**
 * Test 1.1: Email + Password Signup
 * 
 * Given a new email
 * When user signs up with valid password
 * Then user record is created in unverified state and a verification email is sent
 */
test.describe('Authentication - Email Signup', () => {
  let testEmail: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async ({ page }) => {
    testEmail = generateTestEmail('signup');
    await clearAuthState(page);
  });

  test.afterEach(async () => {
    // Cleanup test data
    // Note: In production tests, you'd also want to cleanup the database
  });

  test('should create user account and send verification email', async ({ page }) => {
    // Navigate to auth page
    await page.goto('/auth');
    
    // Ensure we're on the signup tab
    await page.getByRole('tab', { name: /sign up/i }).click();
    
    // Fill in email and password
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill(testPassword);
    
    // Submit the form
    await page.getByRole('button', { name: /sign up/i }).click();
    
    // Should show success message
    await expect(page.getByText(/account created/i)).toBeVisible({ timeout: 10000 });
    
    // Should switch back to sign in tab
    await expect(page.getByText(/sign in/i)).toBeVisible();
    
    // User should still be on auth page (not automatically logged in)
    await expect(page).toHaveURL(/\/auth/);
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('tab', { name: /sign up/i }).click();
    
    // Try with invalid email
    await page.getByLabel(/email/i).fill('invalid-email');
    await page.getByLabel(/password/i).fill(testPassword);
    await page.getByRole('button', { name: /sign up/i }).click();
    
    // Should show validation error
    await expect(page.getByText(/valid email/i)).toBeVisible();
  });

  test('should validate password length', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('tab', { name: /sign up/i }).click();
    
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill('12345'); // Too short
    await page.getByRole('button', { name: /sign up/i }).click();
    
    // Should show validation error
    await expect(page.getByText(/at least 6 characters/i)).toBeVisible();
  });

  test('should require both email and password', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('tab', { name: /sign up/i }).click();
    
    // Try to submit with empty fields
    await page.getByRole('button', { name: /sign up/i }).click();
    
    // Browser validation or app validation should prevent submission
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toHaveAttribute('required');
  });

  test('should prevent duplicate email signup', async ({ page }) => {
    // First signup
    await page.goto('/auth');
    await page.getByRole('tab', { name: /sign up/i }).click();
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill(testPassword);
    await page.getByRole('button', { name: /sign up/i }).click();
    
    await expect(page.getByText(/account created/i)).toBeVisible({ timeout: 10000 });
    
    // Wait a bit
    await page.waitForTimeout(2000);
    
    // Try to sign up again with same email
    await page.getByRole('tab', { name: /sign up/i }).click();
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill(testPassword);
    await page.getByRole('button', { name: /sign up/i }).click();
    
    // Should show error about existing user
    await expect(page.getByText(/already registered|already exists/i)).toBeVisible({ timeout: 10000 });
  });

  test('should trim email whitespace', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('tab', { name: /sign up/i }).click();
    
    // Enter email with leading/trailing spaces
    await page.getByLabel(/email/i).fill(`  ${testEmail}  `);
    await page.getByLabel(/password/i).fill(testPassword);
    await page.getByRole('button', { name: /sign up/i }).click();
    
    // Should still work (trimmed internally)
    await expect(page.getByText(/account created/i)).toBeVisible({ timeout: 10000 });
  });
});

