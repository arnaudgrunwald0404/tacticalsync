import { Page, TestInfo } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RZklsT8x3NUZFmH5coV_8R_M9WvUmQA5OiVJE';

const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  testInfo?: TestInfo
): Promise<T> {
  let lastError: Error | null = null;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (testInfo) {
        testInfo.annotations.push({
          type: 'info',
          description: `Operation succeeded on attempt ${attempt}`,
        });
      }
      return result;
    } catch (error) {
      lastError = error as Error;
      if (testInfo) {
        testInfo.annotations.push({
          type: 'error',
          description: `Attempt ${attempt} failed: ${formatError(error)}`,
        });
      }
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
  errorMessage: string = 'Condition not met',
  testInfo?: TestInfo
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      if (testInfo) {
        testInfo.annotations.push({
          type: 'info',
          description: 'Condition met successfully',
        });
      }
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  const error = new Error(`Timeout: ${errorMessage}`);
  if (testInfo) {
    testInfo.annotations.push({
      type: 'error',
      description: formatError(error),
    });
  }
  throw error;
}

export async function retryClick(
  page: Page,
  selector: string,
  options: { timeout?: number; testInfo?: TestInfo } = {}
): Promise<void> {
  await retryWithBackoff(
    async () => {
      await page.click(selector, { timeout: options.timeout });
    },
    3,
    1000,
    options.testInfo
  );
}

export async function retryFill(
  page: Page,
  selector: string,
  value: string,
  options: { timeout?: number; testInfo?: TestInfo } = {}
): Promise<void> {
  await retryWithBackoff(
    async () => {
      await page.fill(selector, value, { timeout: options.timeout });
    },
    3,
    1000,
    options.testInfo
  );
}

export async function retryWaitForURL(
  page: Page,
  urlOrPredicate: string | RegExp | ((url: URL) => boolean),
  options: { timeout?: number; testInfo?: TestInfo } = {}
): Promise<void> {
  await retryWithBackoff(
    async () => {
      await page.waitForURL(urlOrPredicate, { timeout: options.timeout });
    },
    3,
    1000,
    options.testInfo
  );
}

export async function cleanupTestData(
  options: {
    userId?: string;
    teamId?: string;
    seriesId?: string;
    instanceId?: string;
  } = {},
  testInfo?: TestInfo
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

    if (testInfo) {
      testInfo.annotations.push({
        type: 'info',
        description: 'Test data cleaned up successfully',
      });
    }
  } catch (error) {
    console.error('Error cleaning up test data:', error);
    if (testInfo) {
      testInfo.annotations.push({
        type: 'error',
        description: `Failed to clean up test data: ${formatError(error)}`,
      });
    }
    throw error;
  }
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack}`;
  }
  return String(error);
}

export async function verifyDatabaseState(testInfo?: TestInfo): Promise<void> {
  try {
    // Check each table is empty
    const tables = [
      'comments',
      'meeting_series_action_items',
      'meeting_instance_topics',
      'meeting_instance_priorities',
      'meeting_series_agenda',
      'meeting_instances',
      'recurring_meetings',
      'team_members',
      'teams',
      'profiles',
    ];

    for (const table of tables) {
      const { data, error } = await supabaseAdmin.from(table).select('count');
      if (error) {
        throw error;
      }

      if (data && data[0].count > 0) {
        throw new Error(`Table ${table} is not empty: ${data[0].count} rows`);
      }
    }

    // Check no users exist
    const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    if (usersError) {
      throw usersError;
    }

    if (users.users.length > 0) {
      throw new Error(`Users table is not empty: ${users.users.length} users`);
    }

    if (testInfo) {
      testInfo.annotations.push({
        type: 'info',
        description: 'Database state verified',
      });
    }
  } catch (error) {
    console.error('Failed to verify database state:', error);
    if (testInfo) {
      testInfo.annotations.push({
        type: 'error',
        description: `Database state verification failed: ${formatError(error)}`,
      });
    }
    throw error;
  }
}

export function reportTestFailure(error: Error, testInfo: TestInfo): void {
  console.error('Test failed:', formatError(error));
  testInfo.annotations.push({
    type: 'error',
    description: formatError(error),
  });
}