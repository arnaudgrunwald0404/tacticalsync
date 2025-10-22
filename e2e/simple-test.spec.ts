import { test, expect } from './setup/test-setup';

test('simple test to verify setup', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/TacticalSync/);
});
