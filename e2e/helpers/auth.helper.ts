import { Page } from '@playwright/test';
import { supabaseAdmin } from './supabase.helper';
import { testUsers, type TestUser } from '../fixtures/users';

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
  const { data: { user }, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) throw error;
  if (!user) throw new Error('User creation failed');

  return {
    id: user.id,
    email,
    password,
  };
}

export async function loginViaUI(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');
}

export const loginAsTestUser = loginViaUI;

export async function deleteUser(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    console.warn(`Failed to delete user ${userId}:`, error);
  }
}

export async function waitForLogin(page: Page, timeout: number = 10000): Promise<void> {
  await page.waitForURL(url => {
    return url.pathname === '/dashboard' || 
           url.pathname === '/create-team' ||
           !url.pathname.includes('/auth');
  }, { timeout });
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    const session = await page.evaluate(() => {
      const authStorage = localStorage.getItem('sb-' + window.location.hostname.split('.')[0] + '-auth-token');
      return authStorage !== null;
    });
    return session;
  } catch {
    return false;
  }
}

export async function logout(page: Page): Promise<void> {
  await page.goto('/settings');
  const logoutButton = page.getByRole('button', { name: /log out|sign out/i });
  await logoutButton.click();
  await page.waitForURL('**/auth');
}

export async function clearAuthState(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

export async function setupTestUser(
  page: Page,
  options: {
    email?: string;
    password?: string;
    isAdmin?: boolean;
  } = {}
): Promise<TestUser> {
  const email = options.email || generateTestEmail();
  const password = options.password || testUsers.member.password;
  const user = await createVerifiedUser(email, password);
  await loginViaUI(page, email, password);
  return user;
}

export async function cleanupTestUser(
  page: Page,
  user: TestUser
): Promise<void> {
  await clearAuthState(page);
  await deleteUser(user.id);
}