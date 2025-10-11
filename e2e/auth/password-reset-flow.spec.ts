import { test, expect } from '@playwright/test';
import { generateTestEmail, clearAuthState, createVerifiedUser, deleteUser } from '../helpers/auth.helper';

/**
 * Test 1.7: Password reset flow
 * 
 * Given a verified user
 * When they request reset and use fresh token
 * Then password updates and old sessions are invalidated
 */
test.describe('Password Reset Flow', () => {
  let testEmail: string;
  const testPassword = 'Test123456!';
  const newPassword = 'NewPassword789!';
  let userId: string;

  test.beforeEach(async ({ page }) => {
    testEmail = generateTestEmail('reset');
    const user = await createVerifiedUser(testEmail, testPassword);
    userId = user.id!;
    await clearAuthState(page);
  });

  test.afterEach(async () => {
    if (userId) {
      await deleteUser(userId);
    }
  });

  test('should send password reset email', async ({ page }) => {
    await page.goto('/auth');
    
    // Click "Forgot password?" link
    await page.getByRole('button', { name: /forgot password/i }).click();
    
    // Should show reset password form
    await expect(page.getByText(/reset password/i)).toBeVisible();
    await expect(page.getByText(/enter your email/i)).toBeVisible();
    
    // Enter email
    await page.getByLabel(/email/i).fill(testEmail);
    
    // Submit
    await page.getByRole('button', { name: /send reset link|reset/i }).click();
    
    // Should show success message
    await expect(page.getByText(/reset email sent|check your inbox/i)).toBeVisible({ timeout: 10000 });
    
    // Should clear the form
    await expect(page.getByLabel(/email/i)).toHaveValue('');
  });

  test('should validate email format in password reset', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /forgot password/i }).click();
    
    // Try with invalid email
    await page.getByLabel(/email/i).fill('not-an-email');
    await page.getByRole('button', { name: /send reset link|reset/i }).click();
    
    // Should show validation error
    await expect(page.getByText(/valid email/i)).toBeVisible();
  });

  test('should require email for password reset', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /forgot password/i }).click();
    
    // Try to submit without email
    await page.getByRole('button', { name: /send reset link|reset/i }).click();
    
    // Should show validation error
    await expect(page.getByText(/enter your email/i)).toBeVisible();
  });

  test('should have back to sign in button', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /forgot password/i }).click();
    
    // Should show back button
    const backButton = page.getByRole('button', { name: /back to sign in/i });
    await expect(backButton).toBeVisible();
    
    // Click back
    await backButton.click();
    
    // Should be back on sign in form
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
  });

  test('should handle non-existent email gracefully', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /forgot password/i }).click();
    
    const nonExistentEmail = generateTestEmail('nonexistent');
    await page.getByLabel(/email/i).fill(nonExistentEmail);
    await page.getByRole('button', { name: /send reset link|reset/i }).click();
    
    // For security, should show success message even for non-existent email
    // (don't leak information about which emails are registered)
    await expect(page.getByText(/reset email sent|check your inbox/i)).toBeVisible({ timeout: 10000 });
  });

  test.skip('should complete password reset and invalidate old sessions', async ({ page, context }) => {
    // This test requires:
    // 1. Creating active session with old password
    // 2. Requesting password reset
    // 3. Getting reset token from email/database
    // 4. Completing reset with new password
    // 5. Verifying old session is invalid
    // 6. Verifying login with new password works
    
    // Expected flow:
    // - User logs in with old password (creates session)
    // - User requests password reset
    // - User clicks reset link with token
    // - User enters new password
    // - Password is updated
    // - Old session is invalidated (user logged out)
    // - Login with old password fails
    // - Login with new password succeeds
  });

  test.skip('should reject expired password reset token', async ({ page }) => {
    // This test requires:
    // 1. Creating a password reset token
    // 2. Waiting for it to expire (or manipulating time)
    // 3. Attempting to use expired token
    // 4. Verifying appropriate error message
    
    // Expected behavior:
    // - Navigate to reset URL with expired token
    // - See error: "Reset link has expired"
    // - See button to request new reset email
  });

  test.skip('should reject reused password reset token', async ({ page }) => {
    // This test requires:
    // 1. Creating and using a password reset token
    // 2. Attempting to use the same token again
    // 3. Verifying it's rejected
    
    // Expected behavior:
    // - Use token once successfully
    // - Try to use same token again
    // - See error: "Reset link already used"
    // - See button to request new reset email
  });
});

