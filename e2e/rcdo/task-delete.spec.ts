import { test, expect, type Page } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser } from '../helpers/auth.helper';
import { supabaseAdmin, getTestDatabaseUrl } from '../helpers/supabase.helper';

// Local variant of auth.helper's loginViaUI: that helper does `page.goto('/')`
// before clearing storage, but this app's "/" route is an external redirect
// (see src/App.tsx — ExternalRedirect to tacticalsync.com/inbox), which tears
// down the execution context before the follow-up page.evaluate runs. Using
// '/auth' (an internal route) instead avoids that race without touching the
// shared helper other suites depend on.
async function loginWithInjectedSession(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('No session returned from login');

  const supabaseUrl = getTestDatabaseUrl();
  await page.evaluate(({ session, url }) => {
    const projectRef = url.split('://')[1].split('.')[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    localStorage.setItem(storageKey, JSON.stringify(session));
  }, { session: data.session, url: supabaseUrl });
}

/**
 * Covers the delete option added to the flat Strategic Initiative task
 * table (table view, non sub-SI mode): select a task's checkbox, click
 * the bulk "Delete" action that appears, confirm, and verify the task is
 * gone from both the UI and the database.
 */
test.describe('SI Detail - Flat Task Table Delete', () => {
  // This suite exercises a dev server wired to the local Supabase stack
  // (started separately with VITE_SUPABASE_URL pointed at 127.0.0.1:54321,
  // matching e2e/setup/localSupabaseDefaults.ts), so it needs its own
  // baseURL rather than the shared config's default of localhost:8080.
  test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080' });

  let userEmail: string;
  let userId: string;
  let siId: string;
  let taskId: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async ({ page }) => {
    userEmail = generateTestEmail('task-delete');
    const user = await createVerifiedUser(userEmail, testPassword);
    userId = user.id!;

    const startDate = '2026-01-01';
    const endDate = '2026-06-30';

    const { data: cycle, error: cycleError } = await supabaseAdmin
      .from('rc_cycles')
      .insert({
        type: 'half',
        start_date: startDate,
        end_date: endDate,
        status: 'active',
        created_by: userId,
      })
      .select()
      .single();
    if (cycleError) throw cycleError;

    const { data: rallyingCry, error: rcError } = await supabaseAdmin
      .from('rc_rallying_cries')
      .insert({
        cycle_id: cycle.id,
        title: 'Task Delete Test Rallying Cry',
        owner_user_id: userId,
        status: 'committed',
      })
      .select()
      .single();
    if (rcError) throw rcError;

    const { data: dobj, error: doError } = await supabaseAdmin
      .from('rc_defining_objectives')
      .insert({
        rallying_cry_id: rallyingCry.id,
        title: 'Task Delete Test DO',
        owner_user_id: userId,
        status: 'active',
      })
      .select()
      .single();
    if (doError) throw doError;

    const { data: si, error: siError } = await supabaseAdmin
      .from('rc_strategic_initiatives')
      .insert({
        defining_objective_id: dobj.id,
        title: 'Task Delete Test SI',
        owner_user_id: userId,
        status: 'on_track',
        accepts_sub_sis: false,
      })
      .select()
      .single();
    if (siError) throw siError;
    siId = si.id;

    const { data: task, error: taskError } = await supabaseAdmin
      .from('rc_tasks')
      .insert({
        title: 'Task to delete',
        owner_user_id: userId,
        strategic_initiative_id: siId,
        created_by: userId,
        status: 'not_assigned',
      })
      .select()
      .single();
    if (taskError) throw taskError;
    taskId = task.id;

    await loginWithInjectedSession(page, userEmail, testPassword);
  });

  test.afterEach(async () => {
    if (userId) {
      await deleteUser(userId);
    }
  });

  test('selecting a task and clicking Delete removes it', async ({ page }) => {
    await page.goto(`/rcdo/detail/si/${siId}`);
    // "Task to delete" also appears in the left-nav task tree, so scope to
    // the task table row specifically rather than matching by text alone.
    const row = page.locator('tr', { hasText: 'Task to delete' });
    await expect(row).toBeVisible({ timeout: 15000 });

    // Bulk-action bar is hidden until a row is selected.
    await expect(page.getByText('1 selected')).not.toBeVisible();

    await row.getByRole('checkbox').check();

    await expect(page.getByText('1 selected')).toBeVisible();
    const deleteButton = page.getByRole('button', { name: 'Delete' });
    await expect(deleteButton).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await deleteButton.click();

    await expect(row).not.toBeVisible({ timeout: 10000 });

    const { data: remaining } = await supabaseAdmin
      .from('rc_tasks')
      .select('id')
      .eq('id', taskId)
      .maybeSingle();
    expect(remaining).toBeNull();
  });
});
