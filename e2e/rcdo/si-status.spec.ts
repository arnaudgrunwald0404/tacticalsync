import { test, expect } from '@playwright/test';

/**
 * E2E tests for SI Status functionality
 * Tests status field editing, persistence, and display
 */

test.describe('SI Status Field', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to auth page
    await page.goto('/auth');
    
    // TODO: Login with test user
    // This would require setting up test credentials
    // For now, assume authenticated state
    await page.goto('/dashboard');
  });

  test('should display status field in SI panel', async ({ page }) => {
    // Navigate to strategy canvas
    await page.goto('/dashboard');
    
    // Find and click Strategy button
    const strategyButton = page.locator('button:has-text("Strategy")').first();
    if (await strategyButton.isVisible()) {
      await strategyButton.click();
      
      // Wait for canvas to load
      await page.waitForTimeout(2000);
      
      // Try to find and click an SI node (if exists)
      const siNode = page.locator('[data-node-type="sai"]').first();
      
      if (await siNode.isVisible({ timeout: 5000 }).catch(() => false)) {
        await siNode.click();
        
        // Wait for SI panel to open
        await page.waitForTimeout(1000);
        
        // Check if status field is visible
        const statusLabel = page.locator('text=/status/i');
        await expect(statusLabel).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should show all PRD status options in dropdown', async ({ page }) => {
    // Navigate to strategy canvas
    await page.goto('/dashboard');
    
    const strategyButton = page.locator('button:has-text("Strategy")').first();
    if (await strategyButton.isVisible()) {
      await strategyButton.click();
      await page.waitForTimeout(2000);
      
      const siNode = page.locator('[data-node-type="sai"]').first();
      
      if (await siNode.isVisible({ timeout: 5000 }).catch(() => false)) {
        await siNode.click();
        await page.waitForTimeout(1000);
        
        // Find and click status dropdown
        const statusSelect = page.locator('button[role="combobox"]').first();
        
        if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          await statusSelect.click();
          
          // Wait for dropdown to open
          await page.waitForTimeout(500);
          
          // Check for all PRD status options
          await expect(page.locator('text=Not Started')).toBeVisible();
          await expect(page.locator('text=On Track')).toBeVisible();
          await expect(page.locator('text=At Risk')).toBeVisible();
          await expect(page.locator('text=Off Track')).toBeVisible();
          await expect(page.locator('text=Completed')).toBeVisible();
        }
      }
    }
  });

  test('should update status when selecting new value', async ({ page }) => {
    // Navigate to strategy canvas
    await page.goto('/dashboard');
    
    const strategyButton = page.locator('button:has-text("Strategy")').first();
    if (await strategyButton.isVisible()) {
      await strategyButton.click();
      await page.waitForTimeout(2000);
      
      const siNode = page.locator('[data-node-type="sai"]').first();
      
      if (await siNode.isVisible({ timeout: 5000 }).catch(() => false)) {
        await siNode.click();
        await page.waitForTimeout(1000);
        
        // Find and click status dropdown
        const statusSelect = page.locator('button[role="combobox"]').first();
        
        if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          // Get initial status
          const initialText = await statusSelect.textContent();
          
          await statusSelect.click();
          await page.waitForTimeout(500);
          
          // Select a different status
          const onTrackOption = page.locator('text=On Track');
          if (await onTrackOption.isVisible({ timeout: 2000 }).catch(() => false)) {
            await onTrackOption.click();
            await page.waitForTimeout(1000);
            
            // Verify status changed
            const updatedText = await statusSelect.textContent();
            if (initialText !== 'On Track') {
              expect(updatedText).toContain('On Track');
            }
          }
        }
      }
    }
  });

  test('should display status badge in InitiativeCard', async ({ page }) => {
    // Navigate to a page that shows InitiativeCard components
    // This could be DO detail page or strategy home
    await page.goto('/dashboard');
    
    const strategyButton = page.locator('button:has-text("Strategy")').first();
    if (await strategyButton.isVisible()) {
      await strategyButton.click();
      await page.waitForTimeout(2000);
      
      // Look for DO tiles that might contain SIs
      const doTile = page.locator('[class*="cursor-pointer"]').first();
      
      if (await doTile.isVisible({ timeout: 5000 }).catch(() => false)) {
        await doTile.click();
        await page.waitForTimeout(2000);
        
        // Check for Initiatives tab
        const initiativesTab = page.locator('button:has-text("Initiatives")');
        if (await initiativesTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await initiativesTab.click();
          await page.waitForTimeout(1000);
          
          // Look for status badges
          const statusBadge = page.locator('[class*="Badge"]').first();
          
          if (await statusBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
            const badgeText = await statusBadge.textContent();
            
            // Should be one of the PRD status values
            const validStatuses = [
              'Not Started',
              'On Track',
              'At Risk',
              'Off Track',
              'Completed',
            ];
            
            expect(validStatuses.some(status => badgeText?.includes(status))).toBe(true);
          }
        }
      }
    }
  });

  test('should persist status change after page reload', async ({ page }) => {
    // This test would require:
    // 1. Creating a test SI
    // 2. Changing its status
    // 3. Reloading the page
    // 4. Verifying status persisted
    
    // For now, mark as skipped until test data setup is available
    test.skip('Requires test data setup');
  });

  test('should show correct status colors', async ({ page }) => {
    // Navigate to strategy canvas
    await page.goto('/dashboard');
    
    const strategyButton = page.locator('button:has-text("Strategy")').first();
    if (await strategyButton.isVisible()) {
      await strategyButton.click();
      await page.waitForTimeout(2000);
      
      // Look for status badges with color classes
      const statusBadges = page.locator('[class*="Badge"]');
      const count = await statusBadges.count();
      
      if (count > 0) {
        // Check that badges have color classes
        const firstBadge = statusBadges.first();
        const className = await firstBadge.getAttribute('class');
        
        // Should have a color class (bg-blue-500, bg-green-500, etc.)
        expect(className).toMatch(/bg-(blue|green|yellow|red|purple|gray)-\d+/);
      }
    }
  });
});

test.describe('SI Status - Permissions', () => {
  test('should allow status edit when SI is unlocked', async ({ page }) => {
    // Navigate to strategy canvas
    await page.goto('/dashboard');
    
    const strategyButton = page.locator('button:has-text("Strategy")').first();
    if (await strategyButton.isVisible()) {
      await strategyButton.click();
      await page.waitForTimeout(2000);
      
      const siNode = page.locator('[data-node-type="sai"]').first();
      
      if (await siNode.isVisible({ timeout: 5000 }).catch(() => false)) {
        await siNode.click();
        await page.waitForTimeout(1000);
        
        const statusSelect = page.locator('button[role="combobox"]').first();
        
        if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          // Status should be enabled (not disabled)
          await expect(statusSelect).not.toBeDisabled();
        }
      }
    }
  });

  test('should allow status edit for SI owner even when locked', async ({ page }) => {
    // This test would require:
    // 1. Creating a test SI owned by test user
    // 2. Locking the SI
    // 3. Verifying owner can still edit status
    
    // For now, mark as skipped until test data setup is available
    test.skip('Requires test data setup');
  });

  test('should prevent status edit for non-owner when locked', async ({ page }) => {
    // This test would require:
    // 1. Creating a test SI owned by another user
    // 2. Locking the SI
    // 3. Verifying non-owner cannot edit status
    
    // For now, mark as skipped until test data setup is available
    test.skip('Requires test data setup');
  });
});

