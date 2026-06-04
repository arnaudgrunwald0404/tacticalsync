// One-shot: add the dev test user to every team agrunwald@clearcompany.com belongs to.
// Idempotent — the team_members UNIQUE(team_id, user_id) constraint means re-running is
// a no-op on already-added rows. Reads VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// from .env.local; never logs the service role key.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const OWNER_EMAIL = 'agrunwald@clearcompany.com';
const TEST_USER_EMAIL = 'claude-test-2026@tactical-sync.dev';
const ROLE = 'member';

function loadDotenv(path) {
  const out = {};
  const txt = readFileSync(path, 'utf8');
  for (const line of txt.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const env = loadDotenv(new URL('../.env.local', import.meta.url).pathname);
const url = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// `auth.admin.listUsers` errors at scale on this project. The profiles table mirrors
// the email and shares the same id (FK to auth.users.id) so we go through it instead.
async function findUserIdByEmail(email) {
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (error) throw new Error(`profiles lookup failed for ${email}: ${error.message}`);
  return data?.id ?? null;
}

const ownerId = await findUserIdByEmail(OWNER_EMAIL);
if (!ownerId) {
  console.error(`Could not find user with email ${OWNER_EMAIL}`);
  process.exit(1);
}

const testUserId = await findUserIdByEmail(TEST_USER_EMAIL);
if (!testUserId) {
  console.error(`Could not find user with email ${TEST_USER_EMAIL} — run provision-claude-test-user.mjs first`);
  process.exit(1);
}

// All teams the owner is a member of.
const { data: ownerMemberships, error: memErr } = await admin
  .from('team_members')
  .select('team_id, teams!inner(name)')
  .eq('user_id', ownerId);
if (memErr) {
  console.error('Failed to list owner memberships:', memErr.message);
  process.exit(1);
}

if (!ownerMemberships || ownerMemberships.length === 0) {
  console.error(`${OWNER_EMAIL} is not a member of any teams.`);
  process.exit(1);
}

console.log(`Found ${ownerMemberships.length} team(s) for ${OWNER_EMAIL}:`);
for (const m of ownerMemberships) {
  const name = (m.teams && m.teams.name) || '(unknown)';
  console.log(`  - ${name} (${m.team_id})`);
}

// Build insert rows; the unique constraint on (team_id, user_id) lets us upsert
// without checking existence first.
const rows = ownerMemberships.map(m => ({
  team_id: m.team_id,
  user_id: testUserId,
  role: ROLE,
}));

const { data: inserted, error: insErr } = await admin
  .from('team_members')
  .upsert(rows, { onConflict: 'team_id,user_id', ignoreDuplicates: true })
  .select('team_id');

if (insErr) {
  console.error('Failed to upsert team_members:', insErr.message);
  process.exit(1);
}

console.log(`\nAdded ${TEST_USER_EMAIL} as '${ROLE}' to ${inserted?.length ?? 0} team(s) (existing memberships skipped).`);
