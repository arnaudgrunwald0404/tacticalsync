import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  projects: [
    // Desktop projects — exclude e2e/mobile/** so the mobile-only smoke
    // suite doesn't unintentionally run 3x extra (once per desktop browser)
    // on top of the two mobile projects below.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/mobile/**',
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: '**/mobile/**',
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: '**/mobile/**',
    },
    // Mobile projects — only run e2e/mobile/** specs
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: '**/mobile/**/*.spec.ts',
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
      testMatch: '**/mobile/**/*.spec.ts',
    },
  ],
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:8091',
  //   reuseExistingServer: !process.env.CI,
  //   env: {
  //     VITE_SUPABASE_URL: LOCAL_SUPABASE_URL,
  //     VITE_SUPABASE_ANON_KEY: LOCAL_SUPABASE_ANON_KEY, // see e2e/setup/localSupabaseDefaults.ts
  //   },
  // },
});