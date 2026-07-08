import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY } from '../setup/localSupabaseDefaults';

/**
 * E2E coverage for the inbox "dormant 20%" feature set
 * (PLAN_idea2_dormant20.md): snooze (incl. "until my next 1:1 with X"),
 * saved views, search, and keyboard shortcuts.
 *
 * Runs against a local Supabase stack (`supabase start`) per the project's
 * e2e conventions (see e2e/critical/meeting-flow.spec.ts) — requires Docker
 * with no port conflicts on 54321-54324. Not runnable in every sandbox (a
 * shared multi-project Docker host can have the local Supabase ports already
 * claimed by another project); run locally or in CI where the stack is
 * dedicated to this repo.
 */

const SUPABASE_URL = LOCAL_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = LOCAL_SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface TestUser { id: string; email: string; password: string }

async function createAndLoginUser(page: import('@playwright/test').Page): Promise<TestUser> {
  const email = `inbox-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@test.tactical-sync.dev`;
  const password = 'test-password-123!';

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Failed to create test user: ${error?.message}`);

  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });

  const { data: sessionData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (signInError || !sessionData.session) throw new Error('Failed to sign in test user');

  await page.evaluate(({ session, url }) => {
    const projectRef = url.split('://')[1].split('.')[0];
    localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify(session));
  }, { session: sessionData.session, url: SUPABASE_URL });

  return { id: data.user.id, email, password };
}

async function cleanupUser(user: TestUser) {
  await supabaseAdmin.from('inbox_items').delete().eq('user_id', user.id);
  await supabaseAdmin.from('inbox_views').delete().eq('user_id', user.id);
  await supabaseAdmin.from('inbox_tags').delete().eq('user_id', user.id);
  await supabaseAdmin.auth.admin.deleteUser(user.id);
}

async function seedItem(userId: string, text: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await supabaseAdmin
    .from('inbox_items')
    .insert({ user_id: userId, type: 'task', text, status: 'open', ...overrides })
    .select()
    .single();
  if (error) throw error;
  return data;
}

test.describe('Inbox: snooze', () => {
  let user: TestUser;

  test.beforeEach(async ({ page }) => {
    user = await createAndLoginUser(page);
  });

  test.afterEach(async () => {
    await cleanupUser(user);
  });

  test('snoozing an item via a relative option removes it from All and shows it in Snoozed', async ({ page }) => {
    await seedItem(user.id, 'Follow up on the expense report');
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    const row = page.getByText('Follow up on the expense report');
    await expect(row).toBeVisible();
    await row.hover();

    await page.locator('button[title="Snooze"]').first().click();
    await page.getByText('Tomorrow morning').click();

    await expect(page.getByText('Follow up on the expense report')).not.toBeVisible();

    await page.getByText('Snoozed').first().click();
    await expect(page.getByText('Follow up on the expense report')).toBeVisible();
  });

  test('"until next 1:1" with no upcoming meeting shows a blocking warning, not a silent snooze', async ({ page }) => {
    // Seed a person tag with no cos_team_members row (or one with no
    // upcoming cos_one_on_one_events row) — the resolver must return null.
    const { data: member } = await supabaseAdmin
      .from('cos_team_members')
      .insert({ user_id: user.id, name: 'Jane Doe', role: 'Engineer', relationship_type: 'direct_report' })
      .select()
      .single();
    const { data: tag } = await supabaseAdmin
      .from('inbox_tags')
      .insert({ user_id: user.id, name: 'Jane Doe', type: 'person', member_id: member!.id })
      .select()
      .single();
    const item = await seedItem(user.id, 'Discuss roadmap with Jane');
    await supabaseAdmin.from('inbox_item_tags').insert({ item_id: item.id, tag_id: tag!.id });

    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    const row = page.getByText('Discuss roadmap with Jane');
    await row.hover();
    await page.locator('button[title="Snooze"]').first().click();
    await page.getByText('Until my next 1:1 with…').click();
    await page.getByRole('button', { name: 'Jane Doe' }).click();

    await expect(page.getByText(/No upcoming 1:1 found with Jane Doe/)).toBeVisible();
    // The item must still be visible (not snoozed) since nothing resolved.
    await expect(page.getByText('Discuss roadmap with Jane')).toBeVisible();

    await supabaseAdmin.from('cos_team_members').delete().eq('id', member!.id);
  });

  test('"until next 1:1" with an upcoming meeting snoozes and shows the resolved label', async ({ page }) => {
    const { data: member } = await supabaseAdmin
      .from('cos_team_members')
      .insert({ user_id: user.id, name: 'Jane Doe', role: 'Engineer', relationship_type: 'direct_report' })
      .select()
      .single();
    const { data: tag } = await supabaseAdmin
      .from('inbox_tags')
      .insert({ user_id: user.id, name: 'Jane Doe', type: 'person', member_id: member!.id })
      .select()
      .single();
    const item = await seedItem(user.id, 'Discuss roadmap with Jane');
    await supabaseAdmin.from('inbox_item_tags').insert({ item_id: item.id, tag_id: tag!.id });

    const nextWeek = new Date(Date.now() + 7 * 86_400_000);
    await supabaseAdmin.from('cos_one_on_one_events').insert({
      user_id: user.id,
      team_member_id: member!.id,
      google_event_id: `test-event-${Date.now()}`,
      title: '1:1 with Jane',
      start_time: nextWeek.toISOString(),
      end_time: new Date(nextWeek.getTime() + 30 * 60_000).toISOString(),
      status: 'confirmed',
    });

    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    const row = page.getByText('Discuss roadmap with Jane');
    await row.hover();
    await page.locator('button[title="Snooze"]').first().click();
    await page.getByText('Until my next 1:1 with…').click();
    await page.getByRole('button', { name: 'Jane Doe' }).click();

    await expect(row).not.toBeVisible();
    await page.getByText('Snoozed').first().click();
    await expect(page.getByText(/Until your next 1:1 with Jane Doe/)).toBeVisible();

    await supabaseAdmin.from('cos_team_members').delete().eq('id', member!.id);
  });
});

test.describe('Inbox: search', () => {
  let user: TestUser;

  test.beforeEach(async ({ page }) => {
    user = await createAndLoginUser(page);
    await seedItem(user.id, 'Renew the annual insurance policy');
    await seedItem(user.id, 'Book flights for the offsite');
  });

  test.afterEach(async () => {
    await cleanupUser(user);
  });

  test('typing in the search box filters the item list', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Renew the annual insurance policy')).toBeVisible();
    await expect(page.getByText('Book flights for the offsite')).toBeVisible();

    await page.getByPlaceholder(/Search tasks, notes, briefs/).fill('insurance');
    await page.waitForTimeout(400); // debounce

    await expect(page.getByText('Renew the annual insurance policy')).toBeVisible();
    await expect(page.getByText('Book flights for the offsite')).not.toBeVisible();
  });

  test('clearing the search restores the full list', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');
    const search = page.getByPlaceholder(/Search tasks, notes, briefs/);
    await search.fill('insurance');
    await page.waitForTimeout(400);
    await search.fill('');
    await page.waitForTimeout(400);

    await expect(page.getByText('Renew the annual insurance policy')).toBeVisible();
    await expect(page.getByText('Book flights for the offsite')).toBeVisible();
  });

  test('a search with no matches shows the "no matches" empty state', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder(/Search tasks, notes, briefs/).fill('zzz-nonexistent-zzz');
    await page.waitForTimeout(400);
    await expect(page.getByText(/No matches for/)).toBeVisible();
  });
});

test.describe('Inbox: saved views', () => {
  let user: TestUser;

  test.beforeEach(async ({ page }) => {
    user = await createAndLoginUser(page);
  });

  test.afterEach(async () => {
    await cleanupUser(user);
  });

  test('saving the current view and switching back to it restores the filter', async ({ page }) => {
    await seedItem(user.id, 'Do now item', { workflow_status: 'Do Now' });
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    // Switch to the "Do Now" builtin filter, then save it as a view.
    await page.getByText('Do Now', { exact: true }).click();
    await page.locator('button[title*="Save this filter"]').click();
    await page.getByPlaceholder('View name…').fill('My Do Now View');
    await page.getByPlaceholder('View name…').press('Enter');

    await expect(page.getByText('My Do Now View')).toBeVisible();

    // Switch away, then back via the saved view.
    await page.getByText('All', { exact: true }).click();
    await page.getByText('My Do Now View').click();
    await expect(page.getByText('Do now item')).toBeVisible();
  });

  test('starring a view makes it the default on next load', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');
    await page.locator('button[title*="Save this filter"]').click();
    await page.getByPlaceholder('View name…').fill('Default View');
    await page.getByPlaceholder('View name…').press('Enter');

    const viewRow = page.getByText('Default View').locator('..');
    await viewRow.hover();
    await viewRow.locator('button[title*="default view"]').click();

    await page.reload();
    await page.waitForLoadState('networkidle');
    // The saved view's filter should now be applied on load — the page
    // title reflects it instead of the hardcoded "All" default.
    await expect(page.getByRole('heading', { name: 'Default View' })).toBeVisible();
  });

  test('deleting a view removes it from the sidebar', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');
    await page.locator('button[title*="Save this filter"]').click();
    await page.getByPlaceholder('View name…').fill('Temp View');
    await page.getByPlaceholder('View name…').press('Enter');
    await expect(page.getByText('Temp View')).toBeVisible();

    const viewRow = page.getByText('Temp View').locator('..');
    await viewRow.hover();
    await viewRow.locator('button[title="Delete view"]').click();
    await expect(page.getByText('Temp View')).not.toBeVisible();
  });
});

test.describe('Inbox: keyboard shortcuts', () => {
  let user: TestUser;

  test.beforeEach(async ({ page }) => {
    user = await createAndLoginUser(page);
    // Progressive disclosure gates shortcuts behind >= 5 items.
    for (let i = 0; i < 5; i++) {
      await seedItem(user.id, `Item ${i}`);
    }
  });

  test.afterEach(async () => {
    await cleanupUser(user);
  });

  test('j/k moves focus and d marks the focused item done', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await page.keyboard.press('d');

    // One of the seeded items should now be struck through / marked done —
    // asserted structurally rather than by exact item text since sort order
    // isn't guaranteed.
    await expect(page.locator('.line-through')).toHaveCount(1);
  });

  test('? opens the shortcuts cheat sheet listing all documented shortcuts', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('?');

    await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
    await expect(page.getByText('Next item')).toBeVisible();
    await expect(page.getByText('Mark done')).toBeVisible();
    await expect(page.getByText("Shortcuts don't work while typing in a text field.")).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).not.toBeVisible();
  });

  test('typing in the search box does not trigger navigation shortcuts', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');
    const search = page.getByPlaceholder(/Search tasks, notes, briefs/);
    await search.click();
    await search.type('jjjkkkddd');

    // The keystrokes must have landed in the input, not been swallowed as
    // shortcuts — and no item should have been marked done.
    await expect(search).toHaveValue('jjjkkkddd');
    await expect(page.locator('.line-through')).toHaveCount(0);
  });
});
