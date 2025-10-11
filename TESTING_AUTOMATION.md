# Testing Automation Guide

## Overview

This guide shows you how to automatically run tests on every commit, push, and PR.

---

## 🎯 Three Levels of Automation

### 1. **Local: Git Hooks** (Runs on your machine)
- Pre-commit: Linting before each commit
- Pre-push: Tests before pushing to remote

### 2. **Remote: GitHub Actions** (Runs on GitHub)
- Every push to main/develop
- Every pull request
- Automatic test reports

### 3. **Manual: On-Demand** (When you need it)
- `npm run test:e2e:ui` - Interactive testing
- `npm run test` - Quick unit tests

---

## 📋 Setup Instructions

### Step 1: Install Husky (Git Hooks)

```bash
# Install husky for git hooks
npm install --save-dev husky

# Initialize husky
npx husky init

# Create hooks directory
mkdir -p .husky
```

### Step 2: Set Up Pre-Commit Hook (Linting)

The pre-commit hook is already created at `.husky/pre-commit`.

It runs linting before each commit to catch code style issues early.

**To enable:**
```bash
chmod +x .husky/pre-commit
```

### Step 3: Set Up Pre-Push Hook (Testing)

The pre-push hook is already created at `.husky/pre-push`.

It runs tests before pushing to prevent broken code from reaching the repository.

**To enable:**
```bash
chmod +x .husky/pre-push
```

**Note**: E2E tests are commented out by default (they're slower). Uncomment if you want full testing before every push.

---

## 🔄 GitHub Actions (Already Set Up!)

Your CI/CD pipeline is already configured in `.github/workflows/tests.yml`.

### What It Does

**On every push to main/develop:**
- ✅ Runs all unit tests
- ✅ Runs all E2E tests
- ✅ Runs linter
- ✅ Generates coverage reports
- ✅ Uploads test artifacts

**On every pull request:**
- ✅ Same as above
- ✅ Blocks merge if tests fail (optional)

### Viewing Results

1. Go to your GitHub repository
2. Click **Actions** tab
3. See test runs for each commit/PR
4. Download test reports and screenshots

---

## 🎮 Running Tests Manually

### Quick Commands

```bash
# Interactive UI (best for development)
npm run test:e2e:ui

# Run all E2E tests (headless)
npm run test:e2e

# Run all E2E tests (watch browser)
npm run test:e2e:headed

# Run unit tests (watch mode)
npm run test

# Run with coverage
npm run test:coverage

# Run specific test file
npx playwright test e2e/auth/login-email-password.spec.ts

# Run tests matching pattern
npx playwright test -g "should login"
```

### Debug Mode

```bash
# Debug E2E tests (step through)
npm run test:e2e:debug

# Debug specific test
npx playwright test e2e/auth/login-email-password.spec.ts --debug
```

---

## ⚙️ Configuration Options

### Git Hooks Customization

#### Pre-Commit Hook (`.husky/pre-commit`)

**Default**: Runs linter only
```bash
npm run lint
```

**Add type checking**:
```bash
npm run lint
npx tsc --noEmit  # Type check without building
```

**Add unit tests** (fast):
```bash
npm run lint
npm run test -- --run
```

#### Pre-Push Hook (`.husky/pre-push`)

**Default**: Runs unit tests only
```bash
npm run test -- --run
```

**Add E2E tests** (slower but thorough):
```bash
npm run test -- --run
npm run test:e2e
```

**Run only changed files**:
```bash
# Install lint-staged
npm install --save-dev lint-staged

# Configure in package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint", "npm run test -- --run"]
  }
}
```

---

## 🚦 Workflow Recommendations

### For Development

**Recommended setup**:
- ✅ Pre-commit: Linting only (fast)
- ✅ Pre-push: Unit tests (moderate)
- ✅ GitHub Actions: Full test suite (comprehensive)

**Why**: Balance between speed and safety.

### For Team Collaboration

**Recommended setup**:
- ✅ Pre-commit: Linting + type checking
- ✅ Pre-push: Unit + critical E2E tests
- ✅ GitHub Actions: Full test suite + coverage
- ✅ Require tests to pass before merging PRs

### For Solo Development

**Recommended setup**:
- ✅ Pre-commit: Linting
- ✅ Pre-push: Disabled (run manually)
- ✅ GitHub Actions: Full test suite

**Why**: More flexibility, rely on CI/CD.

---

## 📊 GitHub Actions Configuration

### Current Setup

Located in `.github/workflows/tests.yml`:

```yaml
jobs:
  unit-tests:      # Fast tests
  e2e-tests:       # Comprehensive tests  
  lint:            # Code quality
```

### Customization Options

#### 1. Run on Specific Branches Only

```yaml
on:
  push:
    branches: [ main, develop, staging ]  # Only these branches
```

#### 2. Skip Tests for Docs Changes

```yaml
on:
  push:
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

#### 3. Run Tests in Parallel

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
```

#### 4. Add Test Failure Notifications

```yaml
- name: Notify on failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
```

---

## 🎯 Best Practices

### 1. Start Light, Add More

**Week 1**: Just linting on commit
```bash
# .husky/pre-commit
npm run lint
```

**Week 2**: Add unit tests on push
```bash
# .husky/pre-push
npm run test -- --run
```

**Week 3**: Add critical E2E tests
```bash
# .husky/pre-push
npm run test:e2e -- e2e/auth/ e2e/security/
```

### 2. Make Tests Fast

- Run unit tests locally (fast)
- Run full E2E in CI/CD (thorough)
- Cache dependencies in CI/CD

### 3. Don't Block Developers

If tests are slow:
- Move them to pre-push instead of pre-commit
- Or skip hooks with `--no-verify` when needed:
  ```bash
  git commit --no-verify
  git push --no-verify
  ```

### 4. Monitor Test Performance

```bash
# See test timing
npx playwright test --reporter=html

# Identify slow tests
npx playwright test --reporter=json > report.json
```

---

## 🔍 Troubleshooting

### Git Hooks Not Running

**Problem**: Hooks don't execute
**Solution**:
```bash
chmod +x .husky/pre-commit
chmod +x .husky/pre-push
```

### Tests Failing Locally But Passing in CI

**Problem**: Environment differences
**Solution**:
```bash
# Use same Node version as CI
nvm use 18

# Clear caches
rm -rf node_modules package-lock.json
npm install
```

### GitHub Actions Not Triggering

**Problem**: Workflow not running
**Solution**:
1. Check file is in `.github/workflows/`
2. Check YAML syntax
3. Check branch filters match your branch name
4. Verify GitHub Actions are enabled in repo settings

### Tests Too Slow

**Problem**: Hooks taking too long
**Solution**:
```bash
# Option 1: Run fewer tests
npm run test:e2e -- e2e/auth/  # Just auth tests

# Option 2: Disable hooks temporarily
git commit --no-verify

# Option 3: Make tests parallel
# In playwright.config.ts:
workers: 4  # Run 4 tests at once
```

---

## 📈 Monitoring Test Health

### View Test Results

**Local**:
```bash
# HTML report
npx playwright show-report

# Coverage report
npm run test:coverage
open coverage/index.html
```

**GitHub**:
1. Go to repository → Actions
2. Click on a workflow run
3. Download artifacts (screenshots, reports)
4. View test summary

### Track Test Metrics

Monitor these over time:
- ✅ Pass rate (should stay >95%)
- ⏱️ Execution time (watch for slowdowns)
- 📊 Coverage % (aim for >70%)
- 🐛 Flaky tests (fix or skip)

---

## 🚀 Quick Start Checklist

Follow these steps to enable automation:

- [ ] Install husky: `npm install --save-dev husky`
- [ ] Initialize: `npx husky init`
- [ ] Make hooks executable: `chmod +x .husky/*`
- [ ] Test pre-commit: Make a change and commit
- [ ] Test pre-push: Push to remote
- [ ] Check GitHub Actions: Push to main/develop
- [ ] View results: Go to Actions tab on GitHub

---

## 💡 Pro Tips

### 1. Skip Hooks When Needed
```bash
git commit --no-verify   # Skip pre-commit hook
git push --no-verify     # Skip pre-push hook
```

### 2. Run Only Changed Tests
```bash
# Only test files matching pattern
npx playwright test --grep "login"
```

### 3. Parallel Testing
```bash
# In playwright.config.ts
workers: process.env.CI ? 2 : 4
```

### 4. Test Selection by Tag
```typescript
// Tag tests
test('critical feature @critical', async () => { ... });

// Run tagged tests only
npx playwright test --grep @critical
```

### 5. Watch Mode for Development
```bash
# Auto-rerun on file changes
npm run test  # Vitest watch mode
```

---

## 📞 Getting Help

- **Husky docs**: https://typicode.github.io/husky/
- **GitHub Actions**: https://docs.github.com/actions
- **Playwright CI**: https://playwright.dev/docs/ci
- **Test issues**: Check `TEST_README.md`

---

## 🎉 Summary

You now have three levels of test automation:

1. **Local hooks** - Catch issues before commit/push
2. **GitHub Actions** - Catch issues before merge
3. **Manual runs** - For development and debugging

**All set up and ready to use!**

---

*Testing Automation Complete* ✅

