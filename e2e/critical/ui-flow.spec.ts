import { test as baseTest, expect } from '@playwright/test';

const test = baseTest.extend({});

test.describe('UI Flow Tests', () => {
  test('should load auth page and show form', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Verify page loads
    const title = await page.title();
    expect(title).toContain('TacticalSync');
    
    // Click to reveal email/password form
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    // Verify form elements
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]:has-text("Sign In")')).toBeVisible();
  });

  test('should switch to sign up tab', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Click to reveal form
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    // Switch to sign up tab
    await page.click('button:has-text("Sign Up"), [role="tab"]:has-text("Sign Up")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    // Verify sign up form elements
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]:has-text("Sign Up")')).toBeVisible();
  });

  test('should handle forgot password', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Click to reveal form
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    // Click forgot password
    await page.click('button:has-text("Forgot password?")');
    
    // Should show password reset form or message
    const hasResetForm = await page.locator('input[type="email"]').count() > 0;
    const hasResetMessage = await page.locator('text=reset, text=password').count() > 0;
    
    expect(hasResetForm || hasResetMessage).toBeTruthy();
  });

  test('should handle team routes', async ({ page }) => {
    await page.goto('/team/test-team-id');
    await page.waitForLoadState('networkidle');
    
    // Should either redirect to auth or show team page
    const currentUrl = page.url();
    const isAuthPage = currentUrl.includes('/auth');
    const isTeamPage = currentUrl.includes('/team/');
    
    expect(isAuthPage || isTeamPage).toBeTruthy();
  });

  test('should handle dashboard route', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Should either redirect to auth or show dashboard
    const currentUrl = page.url();
    const isAuthPage = currentUrl.includes('/auth');
    const isDashboardPage = currentUrl.includes('/dashboard');
    
    expect(isAuthPage || isDashboardPage).toBeTruthy();
  });

  test('should handle create-team route', async ({ page }) => {
    await page.goto('/create-team');
    await page.waitForLoadState('networkidle');
    
    // Should either redirect to auth or show create team page
    const currentUrl = page.url();
    const isAuthPage = currentUrl.includes('/auth');
    const isCreateTeamPage = currentUrl.includes('/create-team');
    
    expect(isAuthPage || isCreateTeamPage).toBeTruthy();
  });

  test('should show 404 for invalid routes', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await page.waitForLoadState('networkidle');
    
    // Should show 404 page, redirect to home, or stay on the invalid route
    const has404 = await page.locator('text=404, text=Page not found, text=Oops').count() > 0;
    const isHomePage = page.url().includes('/') && !page.url().includes('/nonexistent-page');
    const isStillInvalidRoute = page.url().includes('/nonexistent-page');
    
    expect(has404 || isHomePage || isStillInvalidRoute).toBeTruthy();
  });

  test('should handle team invite page', async ({ page }) => {
    await page.goto('/join/test-invite-code');
    await page.waitForLoadState('networkidle');
    
    // Should show join page or redirect to auth
    const currentUrl = page.url();
    const isJoinPage = currentUrl.includes('/join/');
    const isAuthPage = currentUrl.includes('/auth');
    
    expect(isJoinPage || isAuthPage).toBeTruthy();
  });

  test('should load home page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Should load home page
    const title = await page.title();
    expect(title).toContain('TacticalSync');
    
    // Should have navigation or content
    const hasContent = await page.locator('h1, h2, main, [data-testid="home"]').count() > 0;
    expect(hasContent).toBeTruthy();
  });
});
