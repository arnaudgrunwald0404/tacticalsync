import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';
import { LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON_KEY, LOCAL_SUPABASE_SERVICE_ROLE_KEY } from '../setup/localSupabaseDefaults';

/**
 * Idea #7 (Relationship memory) — live RLS verification.
 *
 * PersonMemoryConsentModal.tsx tells the user "only you can see it." The
 * static test in src/test/migrations/personMemoryRls.test.ts checks that
 * every relevant table's migration SQL *declares* auth.uid() = user_id
 * scoping, but only a real Postgres instance can confirm RLS actually
 * *enforces* it. This is that verification: two real users, direct
 * table access via each user's own anon-key session (no service role), and
 * an explicit assertion that user B gets zero rows of user A's data across
 * every table the person page and pre-1:1 brief job touch.
 *
 * Requires a running local Supabase (npm run test:e2e boots one) — this is
 * why this lives in e2e rather than the Vitest unit suite, matching this
 * repo's existing convention (see e2e/critical/security.spec.ts for the
 * same two-user-isolation pattern applied to teams).
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || LOCAL_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || LOCAL_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || LOCAL_SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function anonClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createUserAndSignIn(emailPrefix: string) {
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.tactical-sync.dev`;
  const password = 'testpass123!';
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error || !created.user) throw new Error(`Failed to create user: ${error?.message}`);

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Failed to sign in: ${signInError.message}`);

  return { userId: created.user.id, client };
}

test.describe('Idea #7: person memory data isolation (RLS)', () => {
  let userA: { userId: string; client: ReturnType<typeof anonClient> };
  let userB: { userId: string; client: ReturnType<typeof anonClient> };
  let memberIdA: string;

  test.beforeEach(async () => {
    userA = await createUserAndSignIn('person-memory-a');
    userB = await createUserAndSignIn('person-memory-b');

    // Seed user A's data across every table the person page / brief job reads.
    const { data: member } = await admin
      .from('cos_team_members')
      .insert({ user_id: userA.userId, name: 'Private Report', role: 'Engineer', relationship_type: 'direct_report' })
      .select('id')
      .single();
    memberIdA = member!.id;

    const { data: tag } = await admin
      .from('inbox_tags')
      .insert({ user_id: userA.userId, name: 'Private Report', type: 'person', member_id: memberIdA })
      .select('id')
      .single();

    const { data: item } = await admin
      .from('inbox_items')
      .insert({ user_id: userA.userId, type: 'note', text: 'Sensitive 1:1 note about Private Report', status: 'open' })
      .select('id')
      .single();
    await admin.from('inbox_item_tags').insert({ item_id: item!.id, tag_id: tag!.id });

    await admin.from('cos_relationship_documents').insert({
      user_id: userA.userId, team_member_id: memberIdA, content: 'Confidential relationship summary.',
    });
    await admin.from('cos_relationship_topics').insert({
      user_id: userA.userId, team_member_id: memberIdA, topic: 'Performance concern', category: 'feedback', sentiment: 'negative',
    });
    await admin.from('cos_one_on_one_prep').insert({
      user_id: userA.userId, team_member_id: memberIdA, content: 'Confidential prep notes', source: 'manual', status: 'ready', prep_date: '2026-07-01',
    });
    await admin.from('cos_meeting_actions').insert({
      user_id: userA.userId, member_id: memberIdA, text: 'Overdue sensitive commitment', status: 'pending',
      created_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
    });
  });

  test.afterEach(async () => {
    if (memberIdA) await admin.from('cos_team_members').delete().eq('id', memberIdA);
    if (userA?.userId) await admin.auth.admin.deleteUser(userA.userId);
    if (userB?.userId) await admin.auth.admin.deleteUser(userB.userId);
  });

  test('user B cannot read user A\'s tagged inbox items', async () => {
    const { data, error } = await userB.client.from('inbox_items').select('*').eq('user_id', userA.userId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  test('user B cannot read user A\'s person tag', async () => {
    const { data } = await userB.client.from('inbox_tags').select('*').eq('user_id', userA.userId);
    expect(data ?? []).toHaveLength(0);
  });

  test('user B cannot read user A\'s team member record', async () => {
    const { data } = await userB.client.from('cos_team_members').select('*').eq('id', memberIdA);
    expect(data ?? []).toHaveLength(0);
  });

  test('user B cannot read user A\'s rolling relationship document', async () => {
    const { data } = await userB.client.from('cos_relationship_documents').select('*').eq('team_member_id', memberIdA);
    expect(data ?? []).toHaveLength(0);
  });

  test('user B cannot read user A\'s relationship topics', async () => {
    const { data } = await userB.client.from('cos_relationship_topics').select('*').eq('team_member_id', memberIdA);
    expect(data ?? []).toHaveLength(0);
  });

  test('user B cannot read user A\'s 1:1 prep notes', async () => {
    const { data } = await userB.client.from('cos_one_on_one_prep').select('*').eq('team_member_id', memberIdA);
    expect(data ?? []).toHaveLength(0);
  });

  test('user B cannot read user A\'s forgotten commitments (view over cos_meeting_actions)', async () => {
    const { data } = await userB.client.from('cos_forgotten_commitments').select('*').eq('member_id', memberIdA);
    expect(data ?? []).toHaveLength(0);
  });

  test('user A can read their own data across every table (sanity check the isolation above is RLS, not a broken query)', async () => {
    const [items, tags, member, doc, topics, prep, forgotten] = await Promise.all([
      userA.client.from('inbox_items').select('*').eq('user_id', userA.userId),
      userA.client.from('inbox_tags').select('*').eq('user_id', userA.userId),
      userA.client.from('cos_team_members').select('*').eq('id', memberIdA),
      userA.client.from('cos_relationship_documents').select('*').eq('team_member_id', memberIdA),
      userA.client.from('cos_relationship_topics').select('*').eq('team_member_id', memberIdA),
      userA.client.from('cos_one_on_one_prep').select('*').eq('team_member_id', memberIdA),
      userA.client.from('cos_forgotten_commitments').select('*').eq('member_id', memberIdA),
    ]);
    expect((items.data ?? []).length).toBeGreaterThan(0);
    expect((tags.data ?? []).length).toBeGreaterThan(0);
    expect((member.data ?? []).length).toBe(1);
    expect((doc.data ?? []).length).toBe(1);
    expect((topics.data ?? []).length).toBeGreaterThan(0);
    expect((prep.data ?? []).length).toBeGreaterThan(0);
    expect((forgotten.data ?? []).length).toBeGreaterThan(0);
  });
});
