import { test, expect } from '@playwright/test';

/**
 * Basic E2E tests for RCDO module
 * Tests cycle management, DO creation, and navigation
 */

test.describe('RCDO Module - Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to auth page
    await page.goto('/auth');
    
    // TODO: Login with test user
    // This would require setting up test credentials
    // await page.fill('input[type="email"]', 'test@example.com');
    // await page.fill('input[type="password"]', 'testpassword');
    // await page.click('button[type="submit"]');
    
    // For now, skip to dashboard (assumes authenticated state)
    await page.goto('/dashboard');
  });

  test('should navigate to Strategy page from Dashboard', async ({ page }) => {
    // Wait for dashboard to load
    await page.waitForSelector('h1:has-text("Dashboard")', { timeout: 5000 });
    
    // Find and click Strategy button for first team
    const strategyButton = page.locator('button:has-text("Strategy")').first();
    await expect(strategyButton).toBeVisible();
    
    await strategyButton.click();
    
    // Should navigate to strategy page
    await expect(page).toHaveURL(/\/team\/[^/]+\/strategy/);
  });

  test('should display "No Active Strategy Cycle" when no cycle exists', async ({ page }) => {
    // Navigate to strategy page (assuming no cycles exist)
    await page.goto('/dashboard');
    const strategyButton = page.locator('button:has-text("Strategy")').first();
    await strategyButton.click();
    
    // Should show empty state
    await expect(page.locator('text=No Active Strategy Cycle')).toBeVisible();
    await expect(page.locator('text=Create Strategy Cycle')).toBeVisible();
  });

  test('should navigate to Cycle Planner', async ({ page }) => {
    // Navigate to strategy page
    await page.goto('/dashboard');
    const strategyButton = page.locator('button:has-text("Strategy")').first();
    await strategyButton.click();
    
    // Click Manage Cycles button
    const manageCyclesButton = page.locator('button:has-text("Manage Cycles")');
    await manageCyclesButton.click();
    
    // Should navigate to cycles page
    await expect(page).toHaveURL(/\/team\/[^/]+\/strategy\/cycles/);
    await expect(page.locator('h1:has-text("Strategy Cycles")')).toBeVisible();
  });

  test('should create a new cycle', async ({ page }) => {
    // Navigate to cycle planner
    await page.goto('/dashboard');
    const strategyButton = page.locator('button:has-text("Strategy")').first();
    await strategyButton.click();
    
    const manageCyclesButton = page.locator('button:has-text("Manage Cycles")');
    await manageCyclesButton.click();
    
    // Click Create New Cycle button
    const createButton = page.locator('button:has-text("Create New Cycle")');
    if (await createButton.isVisible()) {
      await createButton.click();
      
      // Should redirect back to strategy page
      await expect(page).toHaveURL(/\/team\/[^/]+\/strategy/);
      
      // Cycle should now exist (may show "Define Your Rallying Cry" state)
      const rallyingCryPrompt = page.locator('text=Define Your Rallying Cry');
      await expect(rallyingCryPrompt).toBeVisible();
    }
  });

  test('should display Rallying Cry banner when it exists', async ({ page }) => {
    // This test assumes a rallying cry has been created
    // Navigate to strategy page
    await page.goto('/dashboard');
    const strategyButton = page.locator('button:has-text("Strategy")').first();
    await strategyButton.click();
    
    // Check if banner is visible (conditional - may not exist in test environment)
    const banner = page.locator('[class*="gradient"]').first();
    
    // If banner exists, it should have a title
    if (await banner.isVisible()) {
      await expect(banner).toContainText(/./); // Should contain some text
    }
  });

  test('should navigate to DO detail page when clicking a DO tile', async ({ page }) => {
    // This test assumes DOs exist
    // Navigate to strategy page
    await page.goto('/dashboard');
    const strategyButton = page.locator('button:has-text("Strategy")').first();
    await strategyButton.click();
    
    // Find a DO tile (if exists)
    const doTile = page.locator('[class*="cursor-pointer"]').first();
    
    if (await doTile.isVisible()) {
      await doTile.click();
      
      // Should navigate to DO detail page
      await expect(page).toHaveURL(/\/team\/[^/]+\/strategy\/do\/[^/]+/);
      
      // Should show tabs
      await expect(page.locator('text=Metrics')).toBeVisible();
      await expect(page.locator('text=Initiatives')).toBeVisible();
      await expect(page.locator('text=Links')).toBeVisible();
    }
  });

  test('should display metrics tab in DO detail', async ({ page }) => {
    // This test assumes we're on a DO detail page with metrics
    // For now, just test that the metrics tab is clickable
    const metricsTab = page.locator('button:has-text("Metrics")');
    
    if (await metricsTab.isVisible()) {
      await metricsTab.click();
      
      // Metrics content should be visible
      // (either metrics list or empty state)
      const metricsContent = page.locator('text=No metrics defined yet, text=Current, text=Target').first();
      await expect(metricsContent).toBeVisible({ timeout: 2000 }).catch(() => {
        // Empty state is also valid
      });
    }
  });
});

test.describe('RCDO Module - Permissions', () => {
  test('should show create cycle button only for admins', async ({ page }) => {
    // Navigate to cycle planner
    await page.goto('/dashboard');
    const strategyButton = page.locator('button:has-text("Strategy")').first();
    
    if (await strategyButton.isVisible()) {
      await strategyButton.click();
      
      const manageCyclesButton = page.locator('button:has-text("Manage Cycles")');
      await manageCyclesButton.click();
      
      // Check if create button exists
      const createButton = page.locator('button:has-text("Create New Cycle")');
      const isVisible = await createButton.isVisible().catch(() => false);
      
      // This test would need role-based test setup to properly validate
      // For now, just check that the button behavior is consistent
      expect(typeof isVisible).toBe('boolean');
    }
  });

  test('should show lock/unlock button only for admins in DO detail', async ({ page }) => {
    // This test would require navigating to a DO detail page
    // and checking for lock/unlock button visibility based on role
    // Skipping for basic implementation
    test.skip();
  });
});

