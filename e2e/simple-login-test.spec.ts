import { test as baseTest, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const test = baseTest.extend({});

test('should login with correct credentials', async ({ page }) => {
  // Create a test user first
  const supabaseAdmin = createClient(
    'http://127.0.0.1:54321',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'testpass123';
  
  // Create user
  const { data: { user }, error } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });

  if (error || !user) {
    throw new Error('Failed to create test user');
  }

  try {
    // Navigate to login page
    await page.goto('/auth');
    
    // Wait for page to load and take a screenshot for debugging
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'login-page.png' });

    // Check if we're on the right page
    const title = await page.title();
    console.log('Page title:', title);
    console.log('Current URL:', page.url());

    // Click the "Want to use your email and password?" button to reveal the form
    await page.click('button:has-text("Want to use your email and password?")');
    
    // Wait for the form to appear
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    // Try to find the email input with a more flexible selector
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    
    // Fill in credentials
    await emailInput.fill(testEmail);
    
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    await passwordInput.fill(testPassword);
    
    // Submit form
    const submitButton = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")').first();
    await submitButton.click();

    // Wait a moment for any error messages to appear
    await page.waitForTimeout(2000);
    
    // Check for error messages
    const errorMessage = await page.locator('[data-testid="error"], .error, .text-red-500').textContent().catch(() => null);
    if (errorMessage) {
      console.log('Error message found:', errorMessage);
    }

    // Take a screenshot to see what's happening
    await page.screenshot({ path: 'after-login-attempt.png' });

    // Wait for redirect to dashboard or create-team page
    await page.waitForURL(url => url.pathname.includes('/dashboard') || url.pathname.includes('/create-team'), { timeout: 10000 });
    
    // Verify we're logged in
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/dashboard|\/create-team/);
    
  } finally {
    // Clean up user
    await supabaseAdmin.auth.admin.deleteUser(user.id);
  }
});
