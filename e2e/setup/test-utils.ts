import { test as base } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase.helper';

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.log(`Attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }

  throw new Error(`Operation failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}

export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeout: number = 10000,
  interval: number = 1000,
  errorMessage: string = 'Condition not met'
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout: ${errorMessage}`);
}

export async function cleanupTestData(
  options: {
    userId?: string;
    teamId?: string;
    seriesId?: string;
    instanceId?: string;
  } = {}
): Promise<void> {
  try {
    // Delete in reverse order of dependencies
    if (options.instanceId) {
      await supabaseAdmin
        .from('meeting_instances')
        .delete()
        .eq('id', options.instanceId);
    }

    if (options.seriesId) {
      await supabaseAdmin
        .from('recurring_meetings')
        .delete()
        .eq('id', options.seriesId);
    }

    if (options.teamId) {
      await supabaseAdmin
        .from('teams')
        .delete()
        .eq('id', options.teamId);
    }

    if (options.userId) {
      await supabaseAdmin.auth.admin.deleteUser(options.userId);
    }
  } catch (error) {
    console.error('Error cleaning up test data:', error);
    throw error;
  }
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack}`;
  }
  return String(error);
}

export const test = base.extend({
  // Add custom logging
  page: async ({ page }, use) => {
    // Log all console messages
    page.on('console', msg => {
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
    });

    // Log all uncaught errors
    page.on('pageerror', error => {
      console.error('[Browser Error]', formatError(error));
    });

    // Log all request failures
    page.on('requestfailed', request => {
      console.error(`[Request Failed] ${request.url()}:`, request.failure()?.errorText);
    });

    await use(page);
  },
});
