import { test, expect } from '@playwright/test';
import { generateTestEmail, clearAuthState, createVerifiedUser, deleteUser } from '../helpers/auth.helper';

/**
 * Test 1.6: Login - bad password lockout
 * 
 * Given a verified user
 * When 5 wrong passwords in 10 minutes
 * Then account temporarily locked; show retry-after; unlock flow works
 */
test.describe('Authentication - Account Lockout', () => {
  
  test.skip('should lock account after multiple failed login attempts', async ({ page }) => {
    // This test is skipped because it depends on your Supabase configuration
    // and whether you have rate limiting/account lockout enabled
    
    const testEmail = generateTestEmail('lockout');
    const testPassword = 'Test123456!';
    
    // Create verified user
    const user = await createVerifiedUser(testEmail, testPassword);

    try {
      await clearAuthState(page);
      await page.goto('/auth');
      
      // Attempt to login with wrong password 5 times
      for (let i = 0; i < 5; i++) {
        await page.getByLabel(/email/i).fill(testEmail);
        await page.getByLabel(/password/i).fill(`WrongPassword${i}`);
        await page.getByRole('button', { name: /sign in/i }).click();
        
        // Wait for error
        await expect(page.getByText(/invalid|incorrect/i)).toBeVisible({ timeout: 10000 });
        
        // Small delay between attempts
        await page.waitForTimeout(1000);
      }
      
      // 6th attempt should show lockout message
      await page.getByLabel(/email/i).fill(testEmail);
      await page.getByLabel(/password/i).fill('WrongPassword5');
      await page.getByRole('button', { name: /sign in/i }).click();
      
      // Should show account locked message
      await expect(page.getByText(/account.*locked|too many attempts|try again later/i)).toBeVisible({ timeout: 10000 });
      
      // Should show retry-after information
      await expect(page.getByText(/minutes|wait/i)).toBeVisible();
      
      // Even correct password should be rejected during lockout
      await page.getByLabel(/email/i).fill(testEmail);
      await page.getByLabel(/password/i).fill(testPassword);
      await page.getByRole('button', { name: /sign in/i }).click();
      
      await expect(page.getByText(/account.*locked|too many attempts/i)).toBeVisible({ timeout: 10000 });
      
    } finally {
      if (user.id) {
        await deleteUser(user.id);
      }
    }
  });

  test.skip('should unlock account after lockout period expires', async ({ page }) => {
    // This test would verify that after the lockout period (e.g., 10 minutes)
    // the user can successfully log in again
    // 
    // Implementation requires:
    // 1. Triggering account lockout
    // 2. Waiting for lockout period to expire (or manipulating time)
    // 3. Verifying successful login
    
    // Expected behavior:
    // - After lockout period, login with correct password succeeds
    // - Failed attempt counter resets
  });

  test.skip('should provide account unlock flow via email', async ({ page }) => {
    // If your system provides an "unlock account" email option
    //
    // Expected flow:
    // 1. Account is locked
    // 2. User sees "Unlock account" link/button
    // 3. User receives unlock email
    // 4. Clicking unlock link unlocks account
    // 5. User can log in successfully
  });
});

