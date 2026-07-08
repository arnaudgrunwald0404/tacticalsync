import { test as baseTest, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY } from '../setup/localSupabaseDefaults';

/**
 * E2E coverage for Idea #8 ("People delegation with a paper trail") — the
 * core cross-user flow: delegator delegates an item -> it appears in the
 * delegatee's inbox -> delegatee marks it done -> delegator sees the update.
 *
 * Per PLAN_idea8_people_delegation.md §10, this is the scenario the plan
 * explicitly calls out for two-browser-context E2E coverage, since it's the
 * only way to exercise the real cross-session RLS + realtime behavior rather
 * than mocked unit tests.
 *
 * NOT RUN in this pass: this suite (like the rest of e2e/critical/*) targets
 * a local Supabase stack at 127.0.0.1:54321 via SUPABASE_SERVICE_ROLE_KEY.
 * Local Supabase could not be started in this environment (a different,
 * unrelated local Supabase project — "cleargo" — already holds the default
 * DB port, and a second, independent supabase/storage-api image-pull failure
 * was also hit — see the header comments in
 * supabase/tests/database/inbox_item_delegations.sql for the same
 * blocker hit from the pgTAP side, which WAS worked around there via a
 * standalone container; that workaround does not extend cleanly to the full
 * Vite dev server + Playwright + edge functions stack this suite needs).
 * This file is written to the same conventions as the existing
 * e2e/critical/*.spec.ts suite (admin-client fixture setup/teardown,
 * page.goto + CSS selector interactions) and should run cleanly once
 * `supabase start` succeeds locally; run with:
 *   npm run test:e2e:headed -- e2e/inbox/person-delegation.spec.ts
 */

const test = baseTest.extend({});

const SUPABASE_URL = LOCAL_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = LOCAL_SUPABASE_SERVICE_ROLE_KEY;

test.describe('Person delegation — core cross-user flow', () => {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let delegator: { id: string; email: string; password: string };
  let delegatee: { id: string; email: string; password: string };
  let teamMemberId: string;
  let sourceItemText: string;

  test.beforeEach(async () => {
    const stamp = Date.now();
    const password = 'testpass123';

    // Two real accounts — delegation is inherently a two-user flow, so this
    // needs real cross-session auth, not a single mocked session.
    const { data: delegatorAuth, error: delegatorErr } = await admin.auth.admin.createUser({
      email: `test-delegator-${stamp}@example.com`,
      password,
      email_confirm: true,
    });
    if (delegatorErr || !delegatorAuth.user) throw new Error('Failed to create delegator test user');
    delegator = { id: delegatorAuth.user.id, email: delegatorAuth.user.email!, password };

    const { data: delegateeAuth, error: delegateeErr } = await admin.auth.admin.createUser({
      email: `test-delegatee-${stamp}@example.com`,
      password,
      email_confirm: true,
    });
    if (delegateeErr || !delegateeAuth.user) throw new Error('Failed to create delegatee test user');
    delegatee = { id: delegateeAuth.user.id, email: delegateeAuth.user.email!, password };

    // Seed the account-linking prerequisite directly (Phase 0) — the claim
    // flow itself is covered by ClaimTeamMemberInvite's own tests; this spec
    // is scoped to what happens once a link already exists.
    const { data: teamMember, error: tmErr } = await admin
      .from('cos_team_members')
      .insert({
        user_id: delegator.id,
        name: 'E2E Delegatee',
        role: 'Engineer',
        relationship_type: 'direct_report',
        email: delegatee.email,
        linked_user_id: delegatee.id,
        linked_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (tmErr || !teamMember) throw new Error(`Failed to seed linked cos_team_members row: ${tmErr?.message}`);
    teamMemberId = teamMember.id;

    // Seed the delegator's source inbox item — the thing being delegated.
    sourceItemText = `E2E delegated task ${stamp}`;
    const { error: itemErr } = await admin
      .from('inbox_items')
      .insert({ user_id: delegator.id, type: 'task', text: sourceItemText, status: 'open' });
    if (itemErr) throw new Error(`Failed to seed source inbox_items row: ${itemErr.message}`);
  });

  test.afterEach(async () => {
    // Clean up in dependency order — auth.users cascade should also remove
    // cos_team_members/inbox_items/inbox_item_delegations rows, but delete
    // explicitly first for a clean failure signal if a cascade is missing.
    if (teamMemberId) await admin.from('cos_team_members').delete().eq('id', teamMemberId);
    if (delegator?.id) await admin.from('inbox_items').delete().eq('user_id', delegator.id);
    if (delegatee?.id) await admin.from('inbox_items').delete().eq('user_id', delegatee.id);
    if (delegator?.id) await admin.auth.admin.deleteUser(delegator.id);
    if (delegatee?.id) await admin.auth.admin.deleteUser(delegatee.id);
  });

  async function login(page: import('@playwright/test').Page, email: string, password: string) {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Want to use your email and password?")');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/auth'), { timeout: 10000 });
  }

  test('delegate -> appears in delegatee inbox -> delegatee completes -> delegator sees update', async ({ browser }) => {
    const delegatorContext = await browser.newContext();
    const delegateeContext = await browser.newContext();
    const delegatorPage = await delegatorContext.newPage();
    const delegateePage = await delegateeContext.newPage();

    try {
      // ── Delegator: log in, select the item, delegate to the linked report ──
      await login(delegatorPage, delegator.email, delegator.password);
      await delegatorPage.goto('/inbox');
      await delegatorPage.waitForLoadState('networkidle');

      const itemRow = delegatorPage.locator(`text=${sourceItemText}`).first();
      await expect(itemRow).toBeVisible({ timeout: 10000 });

      // The select checkbox (aria-label="Select item") only renders on hover
      // (InboxItemRow.tsx: `isSelected || revealControls`) or on touch, so
      // hover the row first, then click its checkbox to open the bulk
      // action bar.
      await itemRow.hover();
      await itemRow
        .locator('xpath=ancestor::div[contains(@class,"grid")][1]')
        .getByRole('button', { name: 'Select item' })
        .click();
      await delegatorPage.click('button:has-text("Delegate")');
      await delegatorPage.click('text=E2E Delegatee');

      // Delegator's row now shows "Waiting on" the delegatee.
      await expect(delegatorPage.locator('text=/Waiting on/i')).toBeVisible({ timeout: 10000 });

      // ── Delegatee: the item shows up in their own inbox with an origin badge ──
      await login(delegateePage, delegatee.email, delegatee.password);
      await delegateePage.goto('/inbox');
      await delegateePage.waitForLoadState('networkidle');

      const delegatedItemRow = delegateePage.locator(`text=${sourceItemText}`).first();
      await expect(delegatedItemRow).toBeVisible({ timeout: 10000 });
      await expect(delegateePage.locator('text=/From /i')).toBeVisible({ timeout: 10000 });

      // Mark it done from the delegatee's side. Tasks render their type icon
      // as a Square/CheckSquare toggle (not the select checkbox) when not
      // hovered/selected — clicking the row's own text button opens the
      // drawer, so target the icon slot directly via its accessible role.
      await delegatedItemRow.hover();
      await delegatedItemRow
        .locator('xpath=ancestor::div[contains(@class,"grid")][1]')
        .getByRole('button', { name: 'Select item' })
        .click();
      await delegateePage.click('button:has-text("Mark Done")');

      // ── Delegator: sees the update reflected without manual refresh ────────
      // (realtime subscription — useOutgoingDelegation / the delegation sync
      // trigger). Poll via reload as a fallback if realtime doesn't land
      // within the timeout, so this assertion is robust either way.
      await expect(async () => {
        await delegatorPage.reload();
        await expect(delegatorPage.locator(`text=${sourceItemText}`).first()).not.toBeVisible();
      }).toPass({ timeout: 15000 });
    } finally {
      await delegatorContext.close();
      await delegateeContext.close();
    }
  });

  test('delegating to a not-yet-linked team member is blocked with a clear path to invite', async ({ page }) => {
    // Unlink the seeded relationship for this one test to exercise the
    // not_linked path from the delegator's dropdown (PLAN §8.1B).
    await admin.from('cos_team_members').update({ linked_user_id: null, linked_at: null }).eq('id', teamMemberId);

    await login(page, delegator.email, delegator.password);
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    const itemRow = page.locator(`text=${sourceItemText}`).first();
    await expect(itemRow).toBeVisible({ timeout: 10000 });
    await itemRow.hover();
    await itemRow
      .locator('xpath=ancestor::div[contains(@class,"grid")][1]')
      .getByRole('button', { name: 'Select item' })
      .click();
    await page.click('button:has-text("Delegate")');

    // The unlinked member renders with a "Not linked yet" affix, not as a
    // plain clickable row.
    await expect(page.locator('text=/Not linked yet/i')).toBeVisible({ timeout: 10000 });
    await page.click('text=E2E Delegatee');

    // Clicking opens the inline invite panel instead of silently delegating.
    await expect(page.locator("text=/hasn't linked their account yet/i")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Send invite")')).toBeVisible();
  });
});
