import { Page } from '@playwright/test';
import { supabaseAdmin, getTestDatabaseUrl } from './supabase.helper';
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

    // Ensure profile exists (trigger might not fire in test environment)
    try {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email || email,
          full_name: user.email?.split('@')[0] || email.split('@')[0],
          first_name: null,
          last_name: null,
        }, {
          onConflict: 'id'
        });

      if (profileError) {
        console.warn('Failed to create/update profile:', profileError);
        // Don't throw - profile might already exist from trigger
      }
    } catch (profileError) {
      console.warn('Error ensuring profile exists:', profileError);
      // Don't throw - continue with user creation
    }

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
    // Clear any existing sessions first
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    // For test environments, use direct session creation via API instead of UI
    // This is more reliable and faster than navigating the UI
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data.session) throw new Error('No session returned from login');

    // Inject the session into localStorage
    const supabaseUrl = getTestDatabaseUrl();
    await page.evaluate(({ session, url }) => {
      // Construct the storage key matching Supabase's pattern
      // For local: sb-127-auth-token (from http://127.0.0.1:54321)
      const projectRef = url.split('://')[1].split('.')[0];
      const storageKey = `sb-${projectRef}-auth-token`;
      localStorage.setItem(storageKey, JSON.stringify(session));
    }, { session: data.session, url: supabaseUrl });

    // Navigate to dashboard and wait for it to load
    await page.goto('/dashboard');
    
    // Wait for dashboard to be ready
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
    try {
      const currentUrl = page.url();
      console.error('Current URL:', currentUrl);
      await page.screenshot({ path: `login-error-${Date.now()}.png`, fullPage: true });
    } catch (screenshotError) {
      // Ignore screenshot errors if page is closed
      console.error('Could not take screenshot:', screenshotError);
    }
    throw error;
  }
}

export async function loginAsTestUser(
  page: Page,
  email?: string,
  password?: string
): Promise<void> {
  const testEmail = email || testUsers.member.email;
  const testPassword = password || testUsers.member.password;
  
  // If email/password are explicitly provided, assume user exists
  // Otherwise, ensure the test user exists before trying to log in
  if (!email || !password) {
    try {
      const { data: existingUser } = await supabaseAdmin.auth.admin.getUserByEmail(testEmail);
      if (!existingUser?.user) {
        // User doesn't exist, create it
        await createVerifiedUser(testEmail, testPassword);
      }
    } catch (error) {
      // User doesn't exist, create it
      await createVerifiedUser(testEmail, testPassword);
    }
  }
  
  return loginViaUI(page, testEmail, testPassword);
}

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