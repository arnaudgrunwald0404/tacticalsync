/* eslint-disable react-hooks/rules-of-hooks */
import { test as baseTest } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';
import { LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY } from './localSupabaseDefaults';
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
  // eslint-disable-next-line no-empty-pattern
  supabase: async ({}, use) => {
    const supabase = createClient<Database>(
      LOCAL_SUPABASE_URL,
      LOCAL_SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    await use(supabase);
  },

  // eslint-disable-next-line no-empty-pattern
  testInfo: async ({}, use) => {
    const testInfo = {};
    await use(testInfo);
  },

  // Add error handling and cleanup to page fixture
  page: async ({ page }, use, testInfo) => {
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
      const error = `[Request Failed] ${request.url()}: ${request.failure()?.errorText}`;
      console.error(error);
    });

    await use(page);
  },
});

// Add automatic cleanup after each test
test.afterEach(async ({ testInfo }) => {
  try {
    // Simple cleanup - just log what we're doing
    console.log('Test completed, cleaning up...');
  } catch (error) {
    console.error('Cleanup failed:', error);
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