import { test as baseTest } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';
import {
  retryWithBackoff,
  waitForCondition,
  cleanupTestData,
  formatError,
  verifyDatabaseState,
  reportTestFailure,
  retryClick,
  retryFill,
  retryWaitForURL,
} from './test-utils';

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
  supabase: async ({}, use, testInfo) => {
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
      retry: (operation: () => Promise<any>) => retryWithBackoff(operation, 3, 1000, testInfo),
      waitFor: (condition: () => Promise<boolean>, timeout?: number, interval?: number, errorMessage?: string) =>
        waitForCondition(condition, timeout, interval, errorMessage, testInfo),
      formatError,
    };

    await use(enhancedSupabase);
  },

  testInfo: async ({}, use) => {
    const testInfo = {};
    await use(testInfo);
  },

  // Add error handling and cleanup to page fixture
  page: async ({ page }, use, testInfo) => {
    // Log all console messages
    page.on('console', msg => {
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
      testInfo.annotations.push({
        type: msg.type() === 'error' ? 'error' : 'info',
        description: `[Browser Console] ${msg.type()}: ${msg.text()}`,
      });
    });

    // Log all uncaught errors
    page.on('pageerror', error => {
      console.error('[Browser Error]', formatError(error));
      testInfo.annotations.push({
        type: 'error',
        description: `[Browser Error] ${formatError(error)}`,
      });
    });

    // Log all request failures
    page.on('requestfailed', request => {
      const error = `[Request Failed] ${request.url()}: ${request.failure()?.errorText}`;
      console.error(error);
      testInfo.annotations.push({
        type: 'error',
        description: error,
      });
    });

    // Take screenshot on failure
    page.on('error', async () => {
      const path = `error-${Date.now()}.png`;
      await page.screenshot({ path });
      testInfo.annotations.push({
        type: 'error',
        description: `Screenshot saved to ${path}`,
      });
    });

    // Add retry helpers to page
    const enhancedPage = {
      ...page,
      retryClick: (selector: string, options?: { timeout?: number }) =>
        retryClick(page, selector, { ...options, testInfo }),
      retryFill: (selector: string, value: string, options?: { timeout?: number }) =>
        retryFill(page, selector, value, { ...options, testInfo }),
      retryWaitForURL: (urlOrPredicate: string | RegExp | ((url: URL) => boolean), options?: { timeout?: number }) =>
        retryWaitForURL(page, urlOrPredicate, { ...options, testInfo }),
    };

    await use(enhancedPage);
  },
});

// Add automatic cleanup after each test
test.afterEach(async ({ testInfo }) => {
  try {
    if (Object.keys(testInfo).length > 0) {
      await cleanupTestData(testInfo, testInfo);
    }
    await verifyDatabaseState(testInfo);
  } catch (error) {
    reportTestFailure(error as Error, testInfo);
    throw error;
  }
});

export { expect } from '@playwright/test';
export {
  retryWithBackoff,
  waitForCondition,
  cleanupTestData,
  formatError,
  verifyDatabaseState,
  reportTestFailure,
  retryClick,
  retryFill,
  retryWaitForURL,
};