import { test as baseTest } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';
import { retryWithBackoff, waitForCondition, cleanupTestData, formatError } from './test-utils';

// Extend basic test fixture with our custom fixtures
export type TestFixtures = {
  supabase: ReturnType<typeof createClient<Database>>;
  testInfo: {
    userId?: string;
    teamId?: string;
    seriesId?: string;
    instanceId?: string;
  };
};

export const test = baseTest.extend<TestFixtures>({
  supabase: async ({}, use) => {
    const supabase = createClient<Database>(
      'http://127.0.0.1:54321',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RZklsT8x3NUZFmH5coV_8R_M9WvUmQA5OiVJE',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Add retry and error handling to Supabase operations
    const enhancedSupabase = {
      ...supabase,
      retry: retryWithBackoff,
      waitFor: waitForCondition,
      formatError,
    };

    await use(enhancedSupabase);
  },

  testInfo: async ({}, use) => {
    const testInfo = {};
    await use(testInfo);
  },

  // Add error handling and cleanup to page fixture
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

    // Take screenshot on failure
    page.on('error', async () => {
      await page.screenshot({ path: `error-${Date.now()}.png` });
    });

    await use(page);
  },
});

// Add automatic cleanup after each test
test.afterEach(async ({ testInfo }) => {
  if (Object.keys(testInfo).length > 0) {
    await cleanupTestData(testInfo);
  }
});

export { expect } from '@playwright/test';
export { retryWithBackoff, waitForCondition, cleanupTestData, formatError };
