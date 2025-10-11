import { Page, expect } from '@playwright/test';
import { supabase } from './supabase.helper';

export interface TestUser {
  email: string;
  password: string;
  id?: string;
}

/**
 * Generate a unique test email
 */
export function generateTestEmail(prefix: string = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}-${timestamp}-${random}@test.tactical-sync.dev`;
}

/**
 * Sign up a new user via the UI
 */
export async function signUpViaUI(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/');
  
  // Look for sign up link/button
  const signUpButton = page.getByRole('button', { name: /sign up|create account/i });
  if (await signUpButton.isVisible()) {
    await signUpButton.click();
  }

  // Fill in the form
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  
  // Look for confirm password field if it exists
  const confirmPassword = page.getByLabel(/confirm password|repeat password/i);
  if (await confirmPassword.isVisible().catch(() => false)) {
    await confirmPassword.fill(password);
  }

  // Submit
  await page.getByRole('button', { name: /sign up|create account|continue/i }).click();
}

/**
 * Log in a user via the UI
 */
export async function loginViaUI(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/');
  
  // Fill in credentials
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  
  // Click login button
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click();
}

/**
 * Create a verified user directly via Supabase (bypassing email verification)
 * Useful for tests that need pre-verified users
 */
export async function createVerifiedUser(
  email: string,
  password: string
): Promise<TestUser> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) throw error;
  if (!data.user) throw new Error('User creation failed');

  return {
    email,
    password,
    id: data.user.id,
  };
}

/**
 * Delete a user from the database (cleanup)
 */
export async function deleteUser(userId: string): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.warn(`Failed to delete user ${userId}:`, error);
  }
}

/**
 * Get verification token from database (for email verification tests)
 */
export async function getVerificationToken(email: string): Promise<string | null> {
  // This would need to query your auth.users or a tokens table
  // Implementation depends on your Supabase setup
  // For now, returning null - we'll implement this based on your schema
  const { data, error } = await supabase
    .from('auth.users')
    .select('confirmation_token')
    .eq('email', email)
    .single();

  if (error) return null;
  return data?.confirmation_token || null;
}

/**
 * Wait for user to be logged in (checks for session)
 */
export async function waitForLogin(page: Page, timeout: number = 10000): Promise<void> {
  await page.waitForURL(url => {
    return url.pathname === '/dashboard' || 
           url.pathname === '/create-team' ||
           !url.pathname.includes('/auth');
  }, { timeout });
}

/**
 * Check if user is logged in by checking localStorage or cookies
 */
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

/**
 * Log out the current user
 */
export async function logout(page: Page): Promise<void> {
  // Navigate to a page with logout functionality
  await page.goto('/settings');
  
  // Click logout button
  const logoutButton = page.getByRole('button', { name: /log out|sign out/i });
  await logoutButton.click();
  
  // Wait for redirect to login
  await page.waitForURL('**/auth');
}

/**
 * Clear all auth state (localStorage, cookies, etc)
 */
export async function clearAuthState(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

