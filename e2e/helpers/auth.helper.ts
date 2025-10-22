import { Page } from '@playwright/test';
import { supabaseAdmin } from './supabase.helper';
import { testUsers, type TestUser } from '../fixtures/users';
import { retryWithBackoff, waitForCondition, formatError } from '../setup/test-utils';

export { testUsers, type TestUser } from '../fixtures/users';

export function generateTestEmail(prefix: string = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}-${timestamp}-${random}@test.tactical-sync.dev`;
}

export async function createVerifiedUser(
  email: string = testUsers.member.email,
  password: string = testUsers.member.password
): Promise<TestUser> {
  try {
    const { data: { user }, error } = await retryWithBackoff(async () => {
      const result = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (result.error) throw result.error;
      if (!result.data.user) throw new Error('User creation failed');

      return result;
    });

    if (error) throw error;
    if (!user) throw new Error('User creation failed');

    return {
      id: user.id,
      email,
      password,
    };
  } catch (error) {
    console.error('Failed to create user:', formatError(error));
    throw error;
  }
}

export async function loginViaUI(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  try {
    await page.goto('/auth/sign-in');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await waitForCondition(
      async () => {
        const url = page.url();
        return url.includes('/dashboard') || url.includes('/create-team');
      },
      10000,
      1000,
      'Login timeout: Failed to reach dashboard or create-team page'
    );
  } catch (error) {
    console.error('Login failed:', formatError(error));
    await page.screenshot({ path: `login-error-${Date.now()}.png` });
    throw error;
  }
}

export const loginAsTestUser = loginViaUI;

export async function deleteUser(userId: string): Promise<void> {
  try {
    await retryWithBackoff(async () => {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) throw error;
    });
  } catch (error) {
    console.warn(`Failed to delete user ${userId}:`, formatError(error));
  }
}

export async function waitForLogin(page: Page, timeout: number = 10000): Promise<void> {
  await waitForCondition(
    async () => {
      const url = page.url();
      return url.includes('/dashboard') || 
             url.includes('/create-team') ||
             !url.includes('/auth');
    },
    timeout,
    1000,
    'Login timeout: Failed to reach authenticated page'
  );
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    const session = await page.evaluate(() => {
      const authStorage = localStorage.getItem('sb-' + window.location.hostname.split('.')[0] + '-auth-token');
      return authStorage !== null;
    });
    return session;
  } catch (error) {
    console.error('Failed to check login status:', formatError(error));
    return false;
  }
}

export async function logout(page: Page): Promise<void> {
  try {
    await page.goto('/settings');
    const logoutButton = page.getByRole('button', { name: /log out|sign out/i });
    await logoutButton.click();
    await waitForCondition(
      async () => page.url().includes('/auth'),
      10000,
      1000,
      'Logout timeout: Failed to reach auth page'
    );
  } catch (error) {
    console.error('Logout failed:', formatError(error));
    await page.screenshot({ path: `logout-error-${Date.now()}.png` });
    throw error;
  }
}

export async function clearAuthState(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.clear();
        }
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.clear();
        }
      } catch (e) {
        // Ignore localStorage/sessionStorage errors
        console.warn('Could not clear storage:', e);
      }
    });
    await page.context().clearCookies();
  } catch (error) {
    console.error('Failed to clear auth state:', formatError(error));
    // Don't throw - just log the error and continue
    console.warn('Continuing despite auth state clear failure');
  }
}

export async function setupTestUser(
  page: Page,
  options: {
    email?: string;
    password?: string;
    isAdmin?: boolean;
  } = {}
): Promise<TestUser> {
  try {
    const email = options.email || generateTestEmail();
    const password = options.password || testUsers.member.password;
    const user = await createVerifiedUser(email, password);
    await loginViaUI(page, email, password);
    return user;
  } catch (error) {
    console.error('Failed to setup test user:', formatError(error));
    await page.screenshot({ path: `setup-user-error-${Date.now()}.png` });
    throw error;
  }
}

export async function cleanupTestUser(
  page: Page,
  user: TestUser
): Promise<void> {
  try {
    await clearAuthState(page);
    await deleteUser(user.id);
  } catch (error) {
    console.error('Failed to cleanup test user:', formatError(error));
  }
}