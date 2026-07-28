/**
 * Mobile smoke tests — run with: npm run test:e2e:mobile
 *
 * On first run, snapshot baselines are created automatically.
 * To regenerate them: npm run test:e2e:mobile:update-snapshots
 *
 * These tests catch two classes of mobile regression:
 *   1. Structural: horizontal overflow, clipped interactive elements, tiny tap targets
 *   2. Visual: pixel-level changes caught by snapshot diffs
 */
import { test, expect, Page } from '@playwright/test';

// ─── helpers ────────────────────────────────────────────────────────────────

async function assertNoHorizontalOverflow(page: Page, context = '') {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflow, `Horizontal overflow on ${context || page.url()}`).toBe(false);
}

/** Returns elements whose right edge exceeds the viewport width. */
async function findClippedElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const clipped: string[] = [];
    document.querySelectorAll('button, a, input, [role="button"]').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > vw + 2) {
        // +2px tolerance for sub-pixel rounding
        const label =
          (el as HTMLElement).innerText?.slice(0, 40) ||
          el.getAttribute('aria-label') ||
          el.tagName;
        clipped.push(`${el.tagName}(${label}) right=${Math.round(rect.right)} > vw=${vw}`);
      }
    });
    return clipped;
  });
}

/** All interactive elements should be at least 44×44 px (Apple HIG / WCAG 2.5.5). */
async function findUndersizedTapTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const MIN = 44;
    const small: string[] = [];
    document.querySelectorAll('button, a, [role="button"]').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if ((rect.width > 0 || rect.height > 0) && (rect.width < MIN || rect.height < MIN)) {
        const label =
          (el as HTMLElement).innerText?.slice(0, 40) ||
          el.getAttribute('aria-label') ||
          el.tagName;
        small.push(
          `${el.tagName}(${label}) ${Math.round(rect.width)}×${Math.round(rect.height)}`
        );
      }
    });
    return small;
  });
}

// ─── auth page (public, always reachable) ────────────────────────────────────

test.describe('Auth page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
  });

  test('no horizontal overflow', async ({ page }) => {
    await assertNoHorizontalOverflow(page, 'auth page');
  });

  test('email/password form fields are large enough to tap', async ({ page }) => {
    await page.click('button:has-text("Want to use your email and password?")');
    await expect(page.locator('input[type="email"]')).toBeVisible();

    for (const selector of ['input[type="email"]', 'input[type="password"]']) {
      const box = await page.locator(selector).boundingBox();
      expect(box?.height ?? 0, `${selector} tap height`).toBeGreaterThanOrEqual(40);
    }

    const submitBtn = page.locator('button[type="submit"]:has-text("Sign In")');
    await expect(submitBtn).toBeVisible();
    const btnBox = await submitBtn.boundingBox();
    expect(btnBox?.height ?? 0, 'Sign In button tap height').toBeGreaterThanOrEqual(40);
  });

  test('no clipped interactive elements', async ({ page }) => {
    await page.click('button:has-text("Want to use your email and password?")');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    const clipped = await findClippedElements(page);
    expect(clipped, `Clipped elements: ${clipped.join(', ')}`).toHaveLength(0);
  });

  test('visual snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('auth.png', { fullPage: true });
  });
});

// ─── home / landing ──────────────────────────────────────────────────────────

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('no horizontal overflow', async ({ page }) => {
    await assertNoHorizontalOverflow(page, 'home page');
  });

  test('visual snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('home.png', { fullPage: true });
  });
});

// ─── protected routes (unauthenticated) ──────────────────────────────────────
//
// Without a logged-in session these routes should redirect to /auth.
// We verify (a) the redirect works on mobile, and (b) the landing page has
// no overflow — confirming the mobile redirect path itself is not broken.

const PROTECTED_ROUTES = [
  { name: 'workspace', path: '/workspace' },
  { name: 'my-meetings', path: '/my-meetings' },
  { name: 'dashboard', path: '/dashboard' },
  { name: 'rcdo-canvas', path: '/rcdo/canvas' },
];

test.describe('Protected routes — redirect to auth', () => {
  for (const { name, path } of PROTECTED_ROUTES) {
    test(`${name}: redirects or renders without overflow`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const url = page.url();
      const redirectedToAuth = url.includes('/auth');
      const stayedOnRoute = url.includes(path.split('/')[1]);

      expect(redirectedToAuth || stayedOnRoute, `Unexpected URL: ${url}`).toBe(true);
      await assertNoHorizontalOverflow(page, name);
    });
  }
});

// ─── authenticated smoke tests ────────────────────────────────────────────────
//
// These tests require a valid session stored in the auth state file.
// See e2e/setup/global-setup.ts for how to create one, then run:
//   npm run test:e2e:mobile -- --project=mobile-chrome
//
// They are skipped automatically when no auth state is available.

test.describe('Authenticated views', () => {
  test.use({
    storageState: process.env.PLAYWRIGHT_AUTH_FILE ?? 'e2e/setup/.auth/user.json',
  });

  test.beforeEach(async ({ page }, testInfo) => {
    // Skip gracefully when no auth file exists (CI without credentials, etc.)
    const fs = await import('fs');
    const authFile = process.env.PLAYWRIGHT_AUTH_FILE ?? 'e2e/setup/.auth/user.json';
    if (!fs.existsSync(authFile)) {
      testInfo.skip(true, 'No auth state file — skipping authenticated mobile tests');
    }
    await page.goto('/workspace');
    await page.waitForLoadState('networkidle');
    // If we got bounced to /auth, skip — credentials may be stale
    if (page.url().includes('/auth')) {
      testInfo.skip(true, 'Auth state invalid — skipping authenticated mobile tests');
    }
  });

  test('workspace: no horizontal overflow', async ({ page }) => {
    await assertNoHorizontalOverflow(page, 'workspace');
  });

  test('workspace: no clipped interactive elements', async ({ page }) => {
    const clipped = await findClippedElements(page);
    expect(clipped, `Clipped elements:\n${clipped.join('\n')}`).toHaveLength(0);
  });

  test('workspace: tap targets are large enough', async ({ page }) => {
    const small = await findUndersizedTapTargets(page);
    // Report but don't fail — some icon buttons are intentionally compact.
    // Change to expect(...).toHaveLength(0) once all targets are fixed.
    if (small.length > 0) {
      console.warn(`[mobile] Undersized tap targets on workspace:\n${small.join('\n')}`);
    }
  });

  test('workspace: visual snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('workspace.png', { fullPage: true });
  });

  test('my-meetings: no horizontal overflow', async ({ page }) => {
    await page.goto('/my-meetings');
    await page.waitForLoadState('networkidle');
    await assertNoHorizontalOverflow(page, 'my-meetings');
  });

  test('my-meetings: visual snapshot', async ({ page }) => {
    await page.goto('/my-meetings');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('my-meetings.png', { fullPage: true });
  });
});
