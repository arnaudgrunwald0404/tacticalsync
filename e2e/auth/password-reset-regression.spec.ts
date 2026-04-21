import { test, expect } from '@playwright/test';
import { generateTestEmail, clearAuthState, createVerifiedUser, deleteUser, loginViaUI } from '../helpers/auth.helper';
import { supabaseAdmin } from '../helpers/supabase.helper';

/**
 * Regression tests: Password reset should NOT auto-login
 *
 * Regression for: clicking the password reset email link was logging the
 * user straight into the dashboard instead of showing the reset-password form.
 * Root cause: Auth.tsx onAuthStateChange treated PASSWORD_RECOVERY like SIGNED_IN.
 */
test.describe('Password reset regression: no auto-login', () => {
  let testEmail: string;
  const testPassword = 'Test123456!';
  let userId: string;

  test.beforeEach(async ({ page }) => {
    testEmail = generateTestEmail('resetreg');
    const user = await createVerifiedUser(testEmail, testPassword);
    userId = user.id!;
    await clearAuthState(page);
  });

  test.afterEach(async () => {
    if (userId) await deleteUser(userId);
  });

  test('reset link lands on /reset-password, not /dashboard', async ({ page }) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';

    // Generate a recovery link via admin API (bypasses email)
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: testEmail,
      options: { redirectTo: `${baseUrl}/reset-password` },
    });
    expect(error).toBeNull();

    const recoveryLink = data?.properties?.action_link;
    expect(recoveryLink).toBeTruthy();

    // Simulate clicking the link from the email
    await page.goto(recoveryLink!);

    // Must land on /reset-password, never on /dashboard
    await page.waitForURL(/\/reset-password/, { timeout: 20000 });
    expect(page.url()).toMatch(/\/reset-password/);
    expect(page.url()).not.toMatch(/\/dashboard/);
  });

  test('reset link shows password form, not the app', async ({ page }) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: testEmail,
      options: { redirectTo: `${baseUrl}/reset-password` },
    });
    expect(error).toBeNull();

    await page.goto(data!.properties!.action_link!);
    await page.waitForURL(/\/reset-password/, { timeout: 20000 });

    // Verifying spinner should eventually resolve to the password form
    await expect(page.getByRole('heading', { name: /choose new password/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByLabel(/new password/i)).toBeVisible();

    // App chrome (nav/sidebar/dashboard content) must NOT be visible
    await expect(page.getByText(/my meetings|dashboard|commitments/i)).not.toBeVisible();
  });

  test('reset link still works when user is already logged in', async ({ page }) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';

    // Log in first so there is an active session
    await loginViaUI(page, testEmail, testPassword);
    await page.waitForURL(/\/(dashboard|create-team)/, { timeout: 15000 });

    // Generate recovery link
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: testEmail,
      options: { redirectTo: `${baseUrl}/reset-password` },
    });
    expect(error).toBeNull();

    // Navigate to recovery link even though already logged in
    await page.goto(data!.properties!.action_link!);

    // Should still land on /reset-password (not stay on /dashboard)
    await page.waitForURL(/\/reset-password/, { timeout: 20000 });
    expect(page.url()).toMatch(/\/reset-password/);

    // Password form should be visible
    await expect(page.getByRole('heading', { name: /choose new password/i })).toBeVisible({
      timeout: 15000,
    });
  });
});
