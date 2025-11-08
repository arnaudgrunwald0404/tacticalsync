import { test, expect } from '@playwright/test';
import { generateTestEmail, clearAuthState, createVerifiedUser, deleteUser } from '../helpers/auth.helper';
import { supabaseAdmin } from '../helpers/supabase.helper';

/**
 * Test: Password reset flow - complete flow
 * 
 * Given a verified user
 * When they request password reset and use the reset link
 * Then they can set a new password and login with it
 */
test.describe('Password Reset Flow - Complete', () => {
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

  test('should complete password reset flow', async ({ page }) => {
    // Step 1: Request password reset
    await page.goto('/auth');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check if we need to click to show email form
    const showEmailFormButton = page.getByRole('button', { name: /log in with my email|want to use your email/i });
    if (await showEmailFormButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showEmailFormButton.click();
      await page.waitForTimeout(1000);
    }
    
    // Make sure we're on sign in tab (not sign up) - this is required for "Forgot password?" to be visible
    const signInTab = page.getByRole('tab', { name: /sign in/i });
    if (await signInTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signInTab.click();
      await page.waitForTimeout(500);
    }
    
    // Wait for email form to be visible
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10000 });
    
    // Click "Forgot password?" link/button - it's only visible when !isForgotPassword && !isSignUp
    const forgotPasswordButton = page.getByRole('button', { name: /forgot password/i });
    await forgotPasswordButton.waitFor({ state: 'visible', timeout: 10000 });
    await forgotPasswordButton.click();
    
    // Wait for reset password form to appear
    await page.waitForTimeout(500);
    
    // Verify we're on reset password form - use heading to avoid strict mode violation
    await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible({ timeout: 5000 });
    
    // Enter email and submit
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByRole('button', { name: /send reset link|reset/i }).click();
    
    // Wait for success message
    await expect(page.getByText(/reset email sent|check your inbox/i)).toBeVisible({ timeout: 10000 });
    
    // Step 2: Generate reset link using admin API (instead of reading email)
    const baseUrl = page.url().split('/auth')[0] || 'http://localhost:8080';
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: testEmail,
      options: {
        redirectTo: `${baseUrl}/reset-password`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      throw new Error(`Failed to generate reset link: ${linkError?.message || 'No link generated'}`);
    }

    const resetLink = linkData.properties.action_link;
    console.log('[TEST] Generated reset link:', resetLink);

    // Step 3: Navigate to reset password page with the token
    // The link points to Supabase /auth/v1/verify which will redirect to /reset-password
    await page.goto(resetLink);
    
    // Wait for Supabase to process the token and redirect to /reset-password
    // This might take a moment as Supabase processes the token
    await page.waitForURL(/\/reset-password/, { timeout: 20000 });
    
    const currentUrl = page.url();
    console.log('[TEST] Current URL after clicking reset link:', currentUrl);
    
    // Should be on /reset-password page
    expect(currentUrl).toMatch(/\/reset-password/);
    
    // Step 4: Wait for password form to appear (not verifying state)
    // First, verify the page loaded at all
    await expect(page.getByText(/verifying reset link|choose new password/i)).toBeVisible({ timeout: 10000 });
    
    // Wait for the verifying spinner to disappear and form to appear
    await page.waitForFunction(() => {
      const text = document.body.textContent || '';
      const hasForm = text.includes('Choose New Password') || text.includes('New Password');
      const hasVerifying = text.includes('Verifying reset link');
      return hasForm || !hasVerifying;
    }, { timeout: 40000 });
    
    // Wait a bit more for React to render
    await page.waitForTimeout(2000);
    
    // Check page content for debugging
    const pageContent = await page.textContent('body');
    console.log('[TEST] Page content after waiting:', pageContent?.substring(0, 1000));
    
    // Then wait for the password form to appear - try multiple selectors
    const heading = page.getByRole('heading', { name: /choose new password/i });
    const headingAlt = page.getByText(/choose new password/i);
    
    try {
      await expect(heading).toBeVisible({ timeout: 15000 });
    } catch {
      await expect(headingAlt).toBeVisible({ timeout: 15000 });
    }
    
    // Also check that password inputs are visible
    await expect(page.getByLabel(/new password/i)).toBeVisible({ timeout: 10000 });
    
    // Step 5: Enter new password
    await page.getByLabel(/new password/i).fill(newPassword);
    await page.getByLabel(/confirm password/i).fill(newPassword);
    
    // Step 6: Submit password update
    await page.getByRole('button', { name: /update password/i }).click();
    
    // Step 7: Wait for success message
    await expect(page.getByText(/password updated|successfully/i)).toBeVisible({ timeout: 10000 });
    
    // Step 8: Should redirect to auth page
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
    
    // Step 9: Verify we can login with new password
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill(newPassword);
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should login successfully
    await expect(page.getByText(/signed in successfully/i)).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/(dashboard|create-team)/, { timeout: 15000 });
    
    // Step 10: Verify old password doesn't work
    await clearAuthState(page);
    await page.goto('/auth');
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill(testPassword); // Old password
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should show error
    await expect(page.getByText(/invalid.*password|incorrect.*password|error/i)).toBeVisible({ timeout: 5000 });
  });
});

