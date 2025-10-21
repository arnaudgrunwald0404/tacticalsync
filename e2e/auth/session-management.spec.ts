import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser, loginViaUI } from '../helpers/auth.helper';

test.describe('Session Management', () => {
  test('should maintain session during active usage', async ({ page }) => {
    const userEmail = generateTestEmail('session');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    
    try {
      await loginViaUI(page, userEmail, 'Test123456!');
      await page.waitForURL(/\/(dashboard|create-team)/, { timeout: 15000 });
      
      // Navigate between pages to simulate activity
      await page.goto('/dashboard');
      await page.waitForTimeout(1000);
      
      await page.goto('/settings');
      await page.waitForTimeout(1000);
      
      await page.goto('/dashboard');
      await page.waitForTimeout(1000);
      
      // Should still be logged in
      const url = page.url();
      expect(url).toContain('/dashboard');
      expect(url).not.toContain('/auth');
      
    } finally {
      await deleteUser(user.id!);
    }
  });

  test('should handle page reload without losing session', async ({ page }) => {
    const userEmail = generateTestEmail('reload');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    
    try {
      await loginViaUI(page, userEmail, 'Test123456!');
      await page.waitForURL(/\/(dashboard|create-team)/, { timeout: 15000 });
      
      // Reload page multiple times
      for (let i = 0; i < 3; i++) {
        await page.reload();
        await page.waitForTimeout(1000);
        
        // Should still be logged in
        const url = page.url();
        expect(url).not.toContain('/auth');
      }
      
    } finally {
      await deleteUser(user.id!);
    }
  });

  test('should maintain session with background activity', async ({ page }) => {
    const userEmail = generateTestEmail('background');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    
    try {
      await loginViaUI(page, userEmail, 'Test123456!');
      await page.waitForURL(/\/(dashboard|create-team)/, { timeout: 15000 });
      
      // Simulate background activity
      for (let i = 0; i < 5; i++) {
        // Wait for a short period
        await page.waitForTimeout(2000);
        
        // Perform some action to trigger session refresh
        await page.goto('/dashboard');
        
        // Verify still logged in
        const url = page.url();
        expect(url).toContain('/dashboard');
        expect(url).not.toContain('/auth');
      }
      
    } finally {
      await deleteUser(user.id!);
    }
  });

  test('should handle token refresh correctly', async ({ page }) => {
    const userEmail = generateTestEmail('refresh');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    
    try {
      await loginViaUI(page, userEmail, 'Test123456!');
      await page.waitForURL(/\/(dashboard|create-team)/, { timeout: 15000 });
      
      // Wait for a period that would trigger token refresh
      await page.waitForTimeout(5000);
      
      // Perform an action that requires authentication
      await page.goto('/settings');
      await page.waitForTimeout(1000);
      
      // Should still be logged in
      const url = page.url();
      expect(url).toContain('/settings');
      expect(url).not.toContain('/auth');
      
    } finally {
      await deleteUser(user.id!);
    }
  });
});