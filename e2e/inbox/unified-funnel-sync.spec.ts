import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser, loginAsTestUser } from '../helpers/auth.helper';
import { createTeam, deleteTeam } from '../helpers/team.helper';
import { createRecurringMeeting, createWeeklyMeeting, deleteRecurringMeeting } from '../helpers/meeting.helper';
import { supabaseAdmin } from '../helpers/supabase.helper';

// Idea #1 (Unified Funnel): meeting action items and 1:1 "for me" commitments
// sync into inbox_items via DB triggers — see
// PLAN_idea1_unified_funnel.md and supabase/migrations/20260721000001-3.
//
// These specs verify the end-to-end contract from the outside: create a
// source row, see it land in /inbox; mark it done in the inbox, see the
// source row flip too. The trigger logic itself is covered by the
// structural SQL tests in src/test/migrations/inbox_unified_funnel_sync.test.ts —
// this suite is the live-DB round trip those tests can't exercise.

test.describe('Unified funnel: meeting/1:1 action items sync to inbox', () => {
  let userId: string;
  let userEmail: string;
  let teamId: string;

  test.beforeEach(async () => {
    userEmail = generateTestEmail('unified-funnel');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    userId = user.id;
    const team = await createTeam(userId, 'Unified Funnel Test Team');
    teamId = team.id;
  });

  test.afterEach(async () => {
    // Best-effort cleanup — inbox_items mirrors are cleaned up via cascade
    // when the user is deleted (user_id references auth.users).
    if (teamId) await deleteTeam(teamId).catch(() => {});
    if (userId) await deleteUser(userId).catch(() => {});
  });

  test('a meeting action item assigned to the user appears in their inbox', async ({ page }) => {
    const series = await createRecurringMeeting(teamId, 'Weekly Tactical', 'weekly', userId);
    const instance = await createWeeklyMeeting(teamId, series.id);

    const { data: actionItem, error } = await supabaseAdmin
      .from('meeting_series_action_items')
      .insert({
        series_id: series.id,
        title: `Follow up on the roadmap review ${Date.now()}`,
        notes: 'Discussed in weekly tactical',
        assigned_to: userId,
        created_by: userId,
        order_index: 0,
      })
      .select()
      .single();
    expect(error).toBeNull();

    // The forward-sync trigger (sync_meeting_action_item_to_inbox) fires
    // synchronously on INSERT, so the mirror should exist immediately —
    // assert DB state directly rather than relying on inbox UI refresh timing.
    const { data: mirrored } = await supabaseAdmin
      .from('inbox_items')
      .select('*')
      .eq('user_id', userId)
      .contains('source_ref', { type: 'meeting_action_item', id: actionItem.id })
      .maybeSingle();
    expect(mirrored).not.toBeNull();
    expect(mirrored?.text).toBe(actionItem.title);
    expect(mirrored?.status).toBe('open');

    // And it's visible in the actual inbox UI.
    await loginAsTestUser(page, userEmail, 'Test123456!');
    await page.goto('/inbox');
    await expect(page.getByText(actionItem.title, { exact: false })).toBeVisible({ timeout: 15000 });

    await deleteRecurringMeeting(series.id).catch(() => {});
    void instance;
  });

  test('marking a synced meeting action item done in the inbox marks the source complete too', async ({ page }) => {
    const series = await createRecurringMeeting(teamId, 'Weekly Tactical', 'weekly', userId);
    await createWeeklyMeeting(teamId, series.id);

    const { data: actionItem } = await supabaseAdmin
      .from('meeting_series_action_items')
      .insert({
        series_id: series.id,
        title: `Ship the design doc ${Date.now()}`,
        assigned_to: userId,
        created_by: userId,
        order_index: 0,
      })
      .select()
      .single();

    const { data: mirrored } = await supabaseAdmin
      .from('inbox_items')
      .select('*')
      .eq('user_id', userId)
      .contains('source_ref', { type: 'meeting_action_item', id: actionItem!.id })
      .maybeSingle();
    expect(mirrored).not.toBeNull();

    // Flip the inbox item's status directly (equivalent to the user checking
    // it off via the inbox UI, which calls the same update path) and assert
    // the reverse-sync trigger (sync_inbox_item_status_to_source) completes
    // the source row.
    await supabaseAdmin
      .from('inbox_items')
      .update({ status: 'done', done_at: new Date().toISOString() })
      .eq('id', mirrored!.id);

    const { data: updatedActionItem } = await supabaseAdmin
      .from('meeting_series_action_items')
      .select('completion_status')
      .eq('id', actionItem!.id)
      .single();
    expect(updatedActionItem?.completion_status).toBe('completed');

    await deleteRecurringMeeting(series.id).catch(() => {});
  });

  test('a 1:1 "for me" commitment appears in the inbox, but a "them" commitment does not', async ({ page }) => {
    const { data: member } = await supabaseAdmin
      .from('cos_team_members')
      .insert({
        user_id: userId,
        name: 'Test Report',
        role: 'Engineer',
        relationship_type: 'direct_report',
      })
      .select()
      .single();
    expect(member).not.toBeNull();

    const myText = `Send the comp benchmarking doc ${Date.now()}`;
    const { data: myAction } = await supabaseAdmin
      .from('cos_meeting_actions')
      .insert({ user_id: userId, member_id: member!.id, text: myText, owner: 'me' })
      .select()
      .single();

    const theirText = `Draft the promo packet ${Date.now()}`;
    const { data: theirAction } = await supabaseAdmin
      .from('cos_meeting_actions')
      .insert({ user_id: userId, member_id: member!.id, text: theirText, owner: 'them' })
      .select()
      .single();

    const { data: myMirror } = await supabaseAdmin
      .from('inbox_items')
      .select('*')
      .eq('user_id', userId)
      .contains('source_ref', { type: 'cos_meeting_action', id: myAction!.id })
      .maybeSingle();
    expect(myMirror).not.toBeNull();
    expect(myMirror?.text).toBe(myText);

    const { data: theirMirror } = await supabaseAdmin
      .from('inbox_items')
      .select('*')
      .eq('user_id', userId)
      .contains('source_ref', { type: 'cos_meeting_action', id: theirAction!.id })
      .maybeSingle();
    expect(theirMirror).toBeNull();

    await loginAsTestUser(page, userEmail, 'Test123456!');
    await page.goto('/inbox');
    await expect(page.getByText(myText, { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(theirText, { exact: false })).not.toBeVisible();
  });

  test('deleting a meeting action item archives (not deletes) the mirrored inbox item', async () => {
    const series = await createRecurringMeeting(teamId, 'Weekly Tactical', 'weekly', userId);
    await createWeeklyMeeting(teamId, series.id);

    const { data: actionItem } = await supabaseAdmin
      .from('meeting_series_action_items')
      .insert({
        series_id: series.id,
        title: `Temp item to delete ${Date.now()}`,
        assigned_to: userId,
        created_by: userId,
        order_index: 0,
      })
      .select()
      .single();

    const { data: mirroredBefore } = await supabaseAdmin
      .from('inbox_items')
      .select('id, status')
      .eq('user_id', userId)
      .contains('source_ref', { type: 'meeting_action_item', id: actionItem!.id })
      .maybeSingle();
    expect(mirroredBefore).not.toBeNull();

    await supabaseAdmin
      .from('meeting_series_action_items')
      .delete()
      .eq('id', actionItem!.id);

    const { data: mirroredAfter } = await supabaseAdmin
      .from('inbox_items')
      .select('id, status, archived_at')
      .eq('id', mirroredBefore!.id)
      .maybeSingle();
    expect(mirroredAfter).not.toBeNull();
    expect(mirroredAfter?.status).toBe('archived');
    expect(mirroredAfter?.archived_at).not.toBeNull();

    await deleteRecurringMeeting(series.id).catch(() => {});
  });
});
