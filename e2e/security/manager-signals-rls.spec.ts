import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser } from '../helpers/auth.helper';
import { supabase, supabaseAdmin } from '../helpers/supabase.helper';

/**
 * PLAN_idea9_manager_signals.md §10 — the RLS check this plan explicitly calls
 * out as critical: a manager must never be able to see another manager's
 * direct reports' signals via cos_manager_signal_close_rate /
 * cos_manager_signal_aging_items, even when guessing/supplying the other
 * manager's manager_id or member_id directly.
 *
 * Both views are plain (non-SECURITY DEFINER) views over cos_team_members /
 * inbox_items / inbox_tags / inbox_item_tags, all of which carry owner-only
 * RLS (`auth.uid() = user_id`). So the expectation is that Postgres silently
 * filters cross-manager rows to an EMPTY result — not an error — per RLS
 * semantics. We assert emptiness explicitly rather than assuming it.
 */
test.describe('Security - Manager signal views RLS (Idea #9)', () => {
  let managerAId: string;
  let managerBId: string;
  let managerAEmail: string;
  let managerBEmail: string;
  const password = 'Test123456!';

  let memberAId: string; // managerA's direct report row in cos_team_members
  let memberBId: string; // managerB's direct report row
  let tagAId: string;
  let tagBId: string;
  let itemAId: string;
  let itemBId: string;

  test.beforeEach(async () => {
    managerAEmail = generateTestEmail('mgrA-rls');
    managerBEmail = generateTestEmail('mgrB-rls');
    const managerA = await createVerifiedUser(managerAEmail, password);
    const managerB = await createVerifiedUser(managerBEmail, password);
    managerAId = managerA.id;
    managerBId = managerB.id;

    // Seed each manager with one direct report, one person-tagged inbox item
    // (one closed, one "Waiting on someone") — enough to populate both views.
    const { data: memberA } = await supabaseAdmin
      .from('cos_team_members')
      .insert({ user_id: managerAId, name: 'Report A', role: 'Engineer', relationship_type: 'direct_report' })
      .select('id')
      .single();
    memberAId = memberA!.id;

    const { data: memberB } = await supabaseAdmin
      .from('cos_team_members')
      .insert({ user_id: managerBId, name: 'Report B', role: 'Engineer', relationship_type: 'direct_report' })
      .select('id')
      .single();
    memberBId = memberB!.id;

    const { data: tagA } = await supabaseAdmin
      .from('inbox_tags')
      .insert({ user_id: managerAId, name: 'Report A', type: 'person', member_id: memberAId })
      .select('id')
      .single();
    tagAId = tagA!.id;

    const { data: tagB } = await supabaseAdmin
      .from('inbox_tags')
      .insert({ user_id: managerBId, name: 'Report B', type: 'person', member_id: memberBId })
      .select('id')
      .single();
    tagBId = tagB!.id;

    const { data: itemA } = await supabaseAdmin
      .from('inbox_items')
      .insert({ user_id: managerAId, text: 'Follow up with Report A', status: 'open', workflow_status: 'Waiting on someone' })
      .select('id')
      .single();
    itemAId = itemA!.id;
    await supabaseAdmin.from('inbox_item_tags').insert({ item_id: itemAId, tag_id: tagAId });

    const { data: itemB } = await supabaseAdmin
      .from('inbox_items')
      .insert({ user_id: managerBId, text: 'Follow up with Report B', status: 'open', workflow_status: 'Waiting on someone' })
      .select('id')
      .single();
    itemBId = itemB!.id;
    await supabaseAdmin.from('inbox_item_tags').insert({ item_id: itemBId, tag_id: tagBId });
  });

  test.afterEach(async () => {
    // Child rows first (no ON DELETE CASCADE assumed for cross-table cleanup safety)
    if (itemAId) await supabaseAdmin.from('inbox_item_tags').delete().eq('item_id', itemAId);
    if (itemBId) await supabaseAdmin.from('inbox_item_tags').delete().eq('item_id', itemBId);
    if (itemAId) await supabaseAdmin.from('inbox_items').delete().eq('id', itemAId);
    if (itemBId) await supabaseAdmin.from('inbox_items').delete().eq('id', itemBId);
    if (tagAId) await supabaseAdmin.from('inbox_tags').delete().eq('id', tagAId);
    if (tagBId) await supabaseAdmin.from('inbox_tags').delete().eq('id', tagBId);
    if (memberAId) await supabaseAdmin.from('cos_team_members').delete().eq('id', memberAId);
    if (memberBId) await supabaseAdmin.from('cos_team_members').delete().eq('id', memberBId);
    if (managerAId) await deleteUser(managerAId);
    if (managerBId) await deleteUser(managerBId);
  });

  test('a manager sees their own close-rate signal but not another manager\'s', async () => {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: managerAEmail,
      password,
    });
    expect(signInError).toBeNull();

    // Unfiltered — RLS alone must scope this to managerA's own row.
    const { data: unfiltered, error: unfilteredError } = await supabase
      .from('cos_manager_signal_close_rate' as never)
      .select('*');
    expect(unfilteredError).toBeNull();
    const unfilteredRows = (unfiltered ?? []) as Array<{ manager_id: string; member_id: string }>;
    expect(unfilteredRows.every((r) => r.manager_id === managerAId)).toBe(true);
    expect(unfilteredRows.some((r) => r.member_id === memberAId)).toBe(true);
    expect(unfilteredRows.some((r) => r.member_id === memberBId)).toBe(false);

    // Explicit attempt to guess managerB's manager_id directly — must return
    // EMPTY, not an error and not managerB's row (this is the core assertion
    // plan §10 asks for: RLS enforced at the DB level, not just by the hook's
    // own .eq('manager_id', ...) filter).
    const { data: guessed, error: guessedError } = await supabase
      .from('cos_manager_signal_close_rate' as never)
      .select('*')
      .eq('manager_id', managerBId);
    expect(guessedError).toBeNull();
    expect(guessed).toEqual([]);

    await supabase.auth.signOut();
  });

  test('a manager sees their own aging items but not another manager\'s', async () => {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: managerAEmail,
      password,
    });
    expect(signInError).toBeNull();

    const { data: unfiltered, error: unfilteredError } = await supabase
      .from('cos_manager_signal_aging_items' as never)
      .select('*');
    expect(unfilteredError).toBeNull();
    const rows = (unfiltered ?? []) as Array<{ manager_id: string; item_id: string }>;
    expect(rows.every((r) => r.manager_id === managerAId)).toBe(true);
    expect(rows.some((r) => r.item_id === itemAId)).toBe(true);
    expect(rows.some((r) => r.item_id === itemBId)).toBe(false);

    // Guess managerB's manager_id directly.
    const { data: guessed, error: guessedError } = await supabase
      .from('cos_manager_signal_aging_items' as never)
      .select('*')
      .eq('manager_id', managerBId);
    expect(guessedError).toBeNull();
    expect(guessed).toEqual([]);

    // Guess managerB's item_id directly, without going through manager_id at all.
    const { data: guessedByItem } = await supabase
      .from('cos_manager_signal_aging_items' as never)
      .select('*')
      .eq('item_id', itemBId);
    expect(guessedByItem).toEqual([]);

    await supabase.auth.signOut();
  });

  test('a direct report cannot see their manager\'s notes about them', async () => {
    // If Report A happened to also be a TacticalSync user, they still must not
    // be able to read managerA's signal rows about them — inbox_items.user_id
    // is the MANAGER's id, not the report's, so there is no row for the report
    // to own in the first place. This locks in that plan §2.2 framing at the
    // RLS layer: the report's own login (were they to have one) sees nothing.
    const reportEmail = generateTestEmail('report-rls');
    const report = await createVerifiedUser(reportEmail, password);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: reportEmail,
        password,
      });
      expect(signInError).toBeNull();

      const { data: closeRateRows } = await supabase
        .from('cos_manager_signal_close_rate' as never)
        .select('*');
      expect(closeRateRows).toEqual([]);

      const { data: agingRows } = await supabase
        .from('cos_manager_signal_aging_items' as never)
        .select('*');
      expect(agingRows).toEqual([]);

      await supabase.auth.signOut();
    } finally {
      await deleteUser(report.id);
    }
  });
});
