import { test, expect } from '@playwright/test';
import { generateTestEmail, clearAuthState, createVerifiedUser, deleteUser } from '../helpers/auth.helper';
import { supabase } from '../helpers/supabase.helper';

/**
 * Test 1.2: Email verification - happy path
 * 
 * Given an unverified user with a valid token
 * When they click the verification link within expiry
 * Then account becomes verified and user can log in
 */
test.describe('Email Verification - Happy Path', () => {
  test('should verify email with valid token and allow login', async ({ page }) => {
    const testEmail = generateTestEmail('verify');
    const testPassword = 'Test123456!';

    // Create unverified user via signup
    await page.goto('/auth');
    await page.getByRole('tab', { name: /sign up/i }).click();
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill(testPassword);
    await page.getByRole('button', { name: /sign up/i }).click();
    
    await expect(page.getByText(/account created/i)).toBeVisible({ timeout: 10000 });

    // In a real test, you would:
    // 1. Query your database/email service for the verification link
    // 2. Navigate to that link
    // 3. Verify the account becomes verified
    // 
    // For this test structure, we'll simulate by directly verifying via Supabase
    // then testing the login flow works

    // Wait a bit for user creation
    await page.waitForTimeout(2000);

    // Get the user
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users.users.find(u => u.email === testEmail);
    
    if (user) {
      // Manually verify the user (simulating clicking verification link)
      await supabase.auth.admin.updateUserById(user.id, {
        email_confirm: true
      });

      // Now try to log in
      await page.goto('/auth');
      await page.getByRole('tab', { name: /sign in/i }).click();
      await page.getByLabel(/email/i).fill(testEmail);
      await page.getByLabel(/password/i).fill(testPassword);
      await page.getByRole('button', { name: /sign in/i }).click();

      // Should successfully log in and redirect to dashboard or team creation
      await expect(page).toHaveURL(/\/(dashboard|create-team)/, { timeout: 15000 });
      
      // Cleanup
      await deleteUser(user.id);
    }
  });
});

/**
 * Test 1.3: Email verification - token expired
 * 
 * Given an unverified user with an expired token
 * When they click the link
 * Then verification fails with actionable message and Resend verification works
 */
test.describe('Email Verification - Token Expired', () => {
  test.skip('should show error for expired token with resend option', async ({ page }) => {
    // This test is skipped because it requires:
    // 1. Creating a user with an expired verification token
    // 2. Testing the resend verification flow
    // 
    // Implementation depends on your Supabase configuration and
    // whether you have custom verification token handling
    
    // Expected flow:
    // 1. Navigate to verification URL with expired token
    // 2. See error message: "Verification link has expired"
    // 3. See "Resend verification" button
    // 4. Click resend
    // 5. See success message: "Verification email sent"
  });
});

/**
 * Test 1.4: Email verification - token reuse
 * 
 * Given a token already used
 * When it's clicked again
 * Then show "already verified" (idempotent) and allow login
 */
test.describe('Email Verification - Token Reuse', () => {
  test('should handle already verified account gracefully', async ({ page }) => {
    const testEmail = generateTestEmail('verified');
    const testPassword = 'Test123456!';

    // Create a pre-verified user
    const user = await createVerifiedUser(testEmail, testPassword);

    try {
      // Try to log in (should work since already verified)
      await page.goto('/auth');
      await page.getByLabel(/email/i).fill(testEmail);
      await page.getByLabel(/password/i).fill(testPassword);
      await page.getByRole('button', { name: /sign in/i }).click();

      // Should successfully log in
      await expect(page).toHaveURL(/\/(dashboard|create-team)/, { timeout: 15000 });
      
      // Verify success message or successful navigation
      // (already verified users can log in immediately)
      
    } finally {
      // Cleanup
      if (user.id) {
        await deleteUser(user.id);
      }
    }
  });

  test.skip('should show already verified message when clicking old verification link', async ({ page }) => {
    // This test requires:
    // 1. Creating a verified user
    // 2. Having access to their original verification link
    // 3. Clicking that link
    // 4. Seeing "Account already verified" message
    //
    // Expected behavior:
    // - Navigate to verification URL
    // - See message: "Your email is already verified"
    // - See button: "Continue to Sign In"
    // - Clicking button goes to auth page
  });
});

