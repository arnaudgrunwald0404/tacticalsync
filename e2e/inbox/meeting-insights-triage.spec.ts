import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase.helper';
import { createVerifiedUser, loginViaUI, cleanupTestUser, generateTestEmail } from '../helpers/auth.helper';
import type { TestUser } from '../fixtures/users';

// Covers PLAN_idea3_meeting_insights.md §8's Playwright happy-path list:
// a seeded meeting_insight row renders with its triage buttons, and each of
// Confirm/Save/Dismiss produces the DB effect described in plan §4.
//
// Seeds directly via supabaseAdmin rather than driving the real
// extract-zoom-quotes -> agent-tick pipeline (that pipeline depends on live
// Zoom + Gemini calls — plan §8 explicitly calls that out as a
// guarded/manual smoke test, not a CI candidate).
//
// Requires a running Supabase instance + dev server (SUPABASE_SERVICE_ROLE_KEY,
// PLAYWRIGHT_BASE_URL per CLAUDE.md's e2e setup) — not runnable in this
// sandbox, which has neither Docker nor real credentials available.

let user: TestUser;
let insightItemId: string;

test.beforeEach(async ({ page }) => {
  const email = generateTestEmail('meeting-insights');
  user = await createVerifiedUser(email, 'Test1234!');
  await loginViaUI(page, email, 'Test1234!');

  // Mark the user as having already seen the intro banner so it doesn't
  // intercept clicks in tests that aren't testing the banner itself.
  await supabaseAdmin.from('cos_settings').upsert(
    {
      user_id: user.id,
      onboarding_completed: { welcome: true, lists: true, oneOnOnes: true, meetingInsightsIntro: true },
    },
    { onConflict: 'user_id' },
  );

  const { data, error } = await supabaseAdmin
    .from('inbox_items')
    .insert({
      user_id: user.id,
      type: 'meeting_insight',
      text: 'Marcus said: "We\'re not going to hit Q3 unless we cut scope now." — from Product Sync, Jul 3',
      status: 'open',
      source_ref: {
        type: 'zoom_recording',
        id: 'rec-e2e-1',
        recording_id: 'rec-e2e-1',
        transcript_id: 'tr-e2e-1',
        speaker_name: 'Marcus',
        meeting_topic: 'Product Sync',
        said_on: '2026-07-03',
        context: 'scope commitment',
      },
    })
    .select('id')
    .single();

  if (error || !data) throw error ?? new Error('Failed to seed meeting_insight item');
  insightItemId = data.id;
});

test.afterEach(async ({ page }) => {
  await supabaseAdmin.from('inbox_items').delete().eq('user_id', user.id);
  await cleanupTestUser(page, user).catch(() => {});
});

test('renders a meeting_insight row with its triage buttons', async ({ page }) => {
  await page.goto('/inbox');
  const row = page.getByText(/Marcus said/);
  await expect(row).toBeVisible();
  await expect(page.getByLabel('Confirm — turn into a task')).toBeVisible();
  await expect(page.getByLabel('Save as a note')).toBeVisible();
  await expect(page.getByLabel('Dismiss')).toBeVisible();
});

test('Confirm creates a new task row and marks the insight done', async ({ page }) => {
  await page.goto('/inbox');
  await page.getByLabel('Confirm — turn into a task').click();

  await expect(page.getByText(/Marcus said/)).toHaveCount(0, { timeout: 10000 });

  const { data: original } = await supabaseAdmin
    .from('inbox_items')
    .select('status, done_at')
    .eq('id', insightItemId)
    .single();
  expect(original?.status).toBe('done');
  expect(original?.done_at).not.toBeNull();

  const { data: newTasks } = await supabaseAdmin
    .from('inbox_items')
    .select('id, type, text')
    .eq('user_id', user.id)
    .eq('type', 'task');
  expect(newTasks?.length).toBe(1);
  expect(newTasks?.[0].text).toContain('Follow up:');
});

test('Save creates a new note row and archives the insight', async ({ page }) => {
  await page.goto('/inbox');
  await page.getByLabel('Save as a note').click();

  await expect(page.getByText(/Marcus said/)).toHaveCount(0, { timeout: 10000 });

  const { data: original } = await supabaseAdmin
    .from('inbox_items')
    .select('status, archived_at')
    .eq('id', insightItemId)
    .single();
  expect(original?.status).toBe('archived');
  expect(original?.archived_at).not.toBeNull();

  const { data: newNotes } = await supabaseAdmin
    .from('inbox_items')
    .select('id, type, body')
    .eq('user_id', user.id)
    .eq('type', 'note');
  expect(newNotes?.length).toBe(1);
  expect(newNotes?.[0].body).toContain('Marcus said');
});

test('Dismiss archives the insight without creating a new row', async ({ page }) => {
  await page.goto('/inbox');
  await page.getByLabel('Dismiss').click();

  await expect(page.getByText(/Marcus said/)).toHaveCount(0, { timeout: 10000 });

  const { data: original } = await supabaseAdmin
    .from('inbox_items')
    .select('status, archived_at')
    .eq('id', insightItemId)
    .single();
  expect(original?.status).toBe('archived');
  expect(original?.archived_at).not.toBeNull();

  const { data: allItems } = await supabaseAdmin
    .from('inbox_items')
    .select('id')
    .eq('user_id', user.id);
  expect(allItems?.length).toBe(1); // only the original, no new row
});
