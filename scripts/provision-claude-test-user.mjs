// One-shot: create (or no-op upsert) a dev-only test user for Claude to drive the
// preview browser. Reads VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
// .env.local. Idempotent: re-running prints "exists" and exits 0.
//
// Never logs the service role key. Logs only the user id on success.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const EMAIL = 'claude-test-2026@tactical-sync.dev';
const PASSWORD = 'ClaudeTest!2026';

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

const { data, error } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});

if (error) {
  // "User already registered" / "already been registered" — treat as success.
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('already') || msg.includes('exists')) {
    console.log(`User ${EMAIL} already exists — leaving as is.`);
    process.exit(0);
  }
  console.error('Failed to create user:', error.message);
  process.exit(1);
}

console.log(`Created user ${EMAIL} (id=${data.user?.id ?? 'unknown'}).`);
