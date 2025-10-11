# Test Suite - Quick Reference Card 🚀

## ⚡ Quick Commands

```bash
# E2E Tests
npm run test:e2e          # Run all E2E tests
npm run test:e2e:ui       # Interactive UI ⭐ BEST FOR DEVELOPMENT
npm run test:e2e:headed   # See browser in action
npm run test:e2e:debug    # Debug step-by-step

# Unit Tests
npm run test              # Watch mode (auto-rerun)
npm run test:ui           # Interactive UI
npm run test:coverage     # Coverage report

# Run Single Test
npx playwright test e2e/auth/login-email-password.spec.ts
```

## 📁 Test Files

```
e2e/
├── auth/
│   ├── signup-email-sends-verification.spec.ts   ✅ Ready
│   ├── login-email-password.spec.ts              ✅ Ready
│   ├── password-reset-flow.spec.ts               ✅ Ready
│   └── session-management.spec.ts                ✅ Ready
└── api/
    └── api-contracts.spec.ts                     ✅ Ready
```

## 🔧 Helper Functions

```typescript
// Generate unique test email
const email = generateTestEmail('test');

// Create verified user (bypasses email verification)
const user = await createVerifiedUser(email, password);

// Login through UI
await loginViaUI(page, email, password);

// Cleanup
await deleteUser(userId);
await clearAuthState(page);
```

## 🎯 Common Test Patterns

### Basic E2E Test
```typescript
test('should do something', async ({ page }) => {
  // Arrange
  await page.goto('/auth');
  
  // Act
  await page.getByLabel(/email/i).fill('test@example.com');
  await page.getByRole('button', { name: /sign in/i }).click();
  
  // Assert
  await expect(page).toHaveURL(/\/dashboard/);
});
```

### With User Setup
```typescript
test('should access protected route', async ({ page }) => {
  const email = generateTestEmail('protected');
  const user = await createVerifiedUser(email, 'Test123456!');
  
  try {
    await loginViaUI(page, email, 'Test123456!');
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
  } finally {
    await deleteUser(user.id!);
  }
});
```

## 🐛 Debugging Checklist

❌ **Test Failed?**
1. Run with `--headed` to see browser
2. Check screenshot in `test-results/`
3. Use `--debug` to step through
4. Add `await page.pause()` to stop execution

❌ **Can't Connect?**
1. Is dev server running? (`npm run dev`)
2. Check `PLAYWRIGHT_BASE_URL` in `.env`
3. Verify port 5173 is available

❌ **Auth Not Working?**
1. Check Supabase credentials in `.env`
2. Verify service role key for test helpers
3. Clear browser state: `await clearAuthState(page)`

## 📊 Test Status Legend

- ✅ **Ready to run** - Full implementation
- ⚠️ **Partial** - Core works, some scenarios pending
- ⏸️ **Skipped** - Needs configuration
- ⏳ **Planned** - Not yet implemented

## 🔑 Environment Variables

```bash
# Required
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...  # For test helpers
PLAYWRIGHT_BASE_URL=http://localhost:5173
```

## 🎨 Best Selectors (Priority Order)

1. `getByRole('button', { name: /sign in/i })` ⭐ Best
2. `getByLabel(/email/i)` ⭐ Best
3. `getByText(/welcome/i)`
4. `getByTestId('header')`
5. `locator('.class')` ⚠️ Last resort

## 📝 Writing Tests - Checklist

- [ ] Descriptive test name
- [ ] Setup in `beforeEach`
- [ ] Cleanup in `afterEach`
- [ ] Unique test data (emails, etc.)
- [ ] Clear assertions
- [ ] Handle async properly
- [ ] Test both success and failure

## ⚠️ Common Mistakes

❌ **Shared test data** between tests
✅ Generate unique data per test

❌ **No cleanup** after test
✅ Delete users/data in `afterEach`

❌ **Brittle selectors** like `div > span.class`
✅ Use semantic selectors like `getByRole`

❌ **Missing waits** for async operations
✅ Use `await expect().toBeVisible()`

❌ **Testing implementation** details
✅ Test user-visible behavior

## 🎓 Learning Resources

- Playwright: https://playwright.dev
- Vitest: https://vitest.dev
- Testing Library: https://testing-library.com

## 📚 Full Documentation

- `TESTING_QUICK_START.md` - Get started in 5 minutes
- `TEST_README.md` - Comprehensive guide
- `TEST_IMPLEMENTATION_SUMMARY.md` - What's built

## 🚦 CI/CD Status

Tests run automatically on:
- ✅ Every push to `main` or `develop`
- ✅ Every pull request
- ✅ Results in GitHub Actions

## 💾 File Locations

```
Tests:          e2e/
Helpers:        e2e/helpers/
Config:         playwright.config.ts, vitest.config.ts
Reports:        playwright-report/
Screenshots:    test-results/
Coverage:       coverage/
```

---

**Keep this file handy for quick reference!** 📌

For detailed information, see `TEST_README.md`

