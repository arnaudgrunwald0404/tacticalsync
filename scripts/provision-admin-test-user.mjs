// One-shot: create (or no-op upsert) a dedicated Super Admin testing account, separate
// from the claude-test browser-automation user (see provision-claude-test-user.mjs).
// Use this account to test admin-gated UI and RLS behavior without touching a real
// team member's privileges. Reads VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
// .env.local. Idempotent: re-running re-asserts the admin flags and exits 0.
//
// Never logs the service role key. Logs only the user id and granted flags on success.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const EMAIL = 'admin-test-2026@tactical-sync.dev';
const PASSWORD = 'AdminTest!2026';

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

async function findUserIdByEmail(email) {
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (error) throw new Error(`profiles lookup failed for ${email}: ${error.message}`);
  return data?.id ?? null;
}

let userId = await findUserIdByEmail(EMAIL);

if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  if (error) {
    const msg = (error.message || '').toLowerCase();
    if (!(msg.includes('already') || msg.includes('exists'))) {
      console.error('Failed to create user:', error.message);
      process.exit(1);
    }
  } else {
    userId = data.user?.id ?? null;
    console.log(`Created user ${EMAIL} (id=${userId ?? 'unknown'}).`);
  }

  if (!userId) {
    // Auth user exists but the profiles trigger may not have caught up yet — retry the lookup.
    userId = await findUserIdByEmail(EMAIL);
  }
}

if (!userId) {
  console.error(`Could not resolve profile id for ${EMAIL} after creation.`);
  process.exit(1);
}

const { data: updated, error: updateErr } = await admin
  .from('profiles')
  .update({ is_admin: true, is_super_admin: true, is_rcdo_admin: true })
  .eq('id', userId)
  .select('email, is_admin, is_super_admin, is_rcdo_admin')
  .single();

if (updateErr) {
  console.error('Failed to grant admin flags:', updateErr.message);
  process.exit(1);
}

console.log(`Super Admin testing account ready: ${updated.email} (id=${userId})`);
console.log(
  `  is_admin=${updated.is_admin} is_super_admin=${updated.is_super_admin} is_rcdo_admin=${updated.is_rcdo_admin}`
);
