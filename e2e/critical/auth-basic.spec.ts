import { test as baseTest, expect } from '@playwright/test';

const test = baseTest.extend({});

test.describe('Basic Auth Page Tests', () => {
  test('should load auth page and show form', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Check page title
    const title = await page.title();
    expect(title).toContain('TacticalSync');

    // Check that we're on the auth page
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/auth/);

    // Click the "Want to use your email and password?" button to reveal the form
    await page.click('button:has-text("Want to use your email and password?")');
    
    // Wait for the form to appear
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    // Check that email input is visible
    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible();

    // Check that password input is visible
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible();

    // Check that sign in button is visible
    const signInButton = page.locator('button:has-text("Sign In")').first();
    await expect(signInButton).toBeVisible();
  });

  test('should show sign up tab', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Click the "Want to use your email and password?" button to reveal the form
    await page.click('button:has-text("Want to use your email and password?")');
    
    // Click on sign up tab
    await page.click('button:has-text("Sign Up"), [role="tab"]:has-text("Sign Up")');
    
    // Wait for sign up form to appear
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    // Check that email input is visible
    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible();

    // Check that password input is visible
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible();

    // Check that sign up button is visible
    const signUpButton = page.locator('button:has-text("Sign Up")').first();
    await expect(signUpButton).toBeVisible();
  });
});
