# Testing Quick Start Guide

Get your test suite running in 5 minutes!

## Step 1: Environment Setup

Your test dependencies are already installed! Just configure your environment:

1. **Check your `.env` file** - Tests will use your existing Supabase configuration
   
   OR

2. **Create `.env.test`** for separate test configuration:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   PLAYWRIGHT_BASE_URL=http://localhost:5173
   ```

⚠️ **Important**: Never commit your `SUPABASE_SERVICE_ROLE_KEY` to version control!

## Step 2: Run Your First Tests

### Quick Test Run (Recommended)

```bash
# Start your dev server in one terminal
npm run dev

# In another terminal, run a simple E2E test
npx playwright test e2e/auth/signup-email-sends-verification.spec.ts --headed
```

This will open a browser and you'll see the test running!

### Run All Tests

```bash
# E2E tests (make sure dev server is running)
npm run test:e2e

# Unit tests (watch mode)
npm run test
```

## Step 3: Explore Test UI (Recommended for Development)

### Playwright UI (Best for E2E debugging)

```bash
npm run test:e2e:ui
```

This opens an interactive UI where you can:
- ✅ Run individual tests
- 🔍 See test steps in real-time
- 🎯 Debug failures easily
- 📸 View screenshots and traces

### Vitest UI (Best for Unit testing)

```bash
npm run test:ui
```

## What Tests Are Available?

### ✅ Ready to Run

**Authentication Tests:**
- ✅ Email signup with validation
- ✅ Login with correct/incorrect credentials  
- ✅ Password reset flow
- ✅ Session persistence across page reloads
- ✅ Protected route access control

**API Tests:**
- ✅ Email format validation
- ✅ Password requirements enforcement

### ⚠️ Need Configuration

Some tests are marked with `test.skip()` because they require specific setup:

- **Email Verification**: Needs email service integration or mocking
- **OAuth Testing**: Needs Google OAuth mocking or test credentials
- **Account Lockout**: Needs Supabase rate limiting configuration

## Common Commands

```bash
# E2E Tests
npm run test:e2e              # Run all E2E tests (headless)
npm run test:e2e:ui           # Interactive UI mode (RECOMMENDED)
npm run test:e2e:headed       # See browser while running
npm run test:e2e:debug        # Debug mode with breakpoints

# Unit Tests  
npm run test                  # Watch mode (auto-reruns)
npm run test:ui               # Interactive UI
npm run test:coverage         # Generate coverage report

# Run specific test
npx playwright test e2e/auth/login-email-password.spec.ts
```

## Understanding Test Results

### ✅ Green/Passing
Your test worked! The application behaves as expected.

### ❌ Red/Failing
Something broke. The test output will show:
- What was expected
- What actually happened
- Screenshot of the failure (for E2E tests)

### ⊘ Skipped
Test is intentionally skipped (usually needs specific configuration).

## Quick Debugging Tips

### E2E Test Failed?

1. **Run in headed mode**: `npm run test:e2e:headed`
   - You'll see what the browser is doing

2. **Use debug mode**: `npm run test:e2e:debug`
   - Step through test line by line

3. **Check screenshots**: Automatically saved in `test-results/`

### Unit Test Failed?

1. **Check the terminal output** - Error message tells you what failed
2. **Add console.log()** - Simple but effective
3. **Use debugger** - Add `debugger;` statement in your test

## Test File Structure

```typescript
test.describe('Feature Name', () => {
  // Runs before each test
  test.beforeEach(async ({ page }) => {
    // Setup code
  });

  // Runs after each test
  test.afterEach(async () => {
    // Cleanup code
  });

  // Individual test
  test('should do something', async ({ page }) => {
    // Your test code
  });
});
```

## Writing Your First Test

### E2E Test Example

```typescript
// e2e/example.spec.ts
import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
  // Navigate to page
  await page.goto('/');
  
  // Check if logo is visible
  await expect(page.getByRole('img', { name: /logo/i })).toBeVisible();
  
  // Check if sign in button exists
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});
```

Run it:
```bash
npx playwright test e2e/example.spec.ts --headed
```

### Unit Test Example

```typescript
// src/test/example.test.ts
import { describe, it, expect } from 'vitest';

describe('Math operations', () => {
  it('should add numbers correctly', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run it:
```bash
npx vitest src/test/example.test.ts
```

## Best Practices

### ✅ DO
- Clean up test data in `afterEach`
- Use unique test data (emails, names, etc.)
- Test both success and error cases
- Use descriptive test names
- Keep tests independent

### ❌ DON'T
- Share data between tests
- Depend on test execution order
- Test implementation details
- Leave test data in database
- Commit sensitive credentials

## Next Steps

1. **Run the existing tests** to see them in action
2. **Explore `TEST_README.md`** for comprehensive documentation
3. **Check test helpers** in `e2e/helpers/` for useful utilities
4. **Start writing tests** for new features as you build them

## Need Help?

- **Playwright Docs**: https://playwright.dev
- **Vitest Docs**: https://vitest.dev
- **Test Helpers**: Check `e2e/helpers/auth.helper.ts`
- **Examples**: Look at existing test files in `e2e/auth/`

## Troubleshooting

### "Cannot find module '@supabase/supabase-js'"
Run: `npm install`

### "Browser not found"  
Run: `npx playwright install --with-deps chromium`

### "Connection refused" or "Page not found"
Make sure dev server is running: `npm run dev`

### Tests timeout
- Check if dev server is running
- Increase timeout in `playwright.config.ts` if needed
- Check network connection

---

**Happy Testing! 🎉**

Remember: Good tests save hours of debugging later!

