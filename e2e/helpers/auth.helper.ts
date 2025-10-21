import { Page } from '@playwright/test';
import { supabase } from './supabase.helper';

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export function generateTestEmail(prefix: string = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}-${timestamp}-${random}@test.tactical-sync.dev`;
}

export async function createVerifiedUser(
  email: string,
  password: string
): Promise<TestUser> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;
  if (!data.user) throw new Error('User creation failed');

  return {
    id: data.user.id,
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
  const { error } = await supabase.auth.admin.deleteUser(userId);
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