import { createClient } from '@supabase/supabase-js';
import { Database } from './types';

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
// Support both legacy and current variable names during transition
const supabaseAnonKey =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ??
  import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL environment variable. Please check your .env.local file.');
}

if (!supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) environment variable. Please check your .env.local file.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    // Some statuses PostgREST can return (e.g. 300 for an ambiguous embed) are
    // heuristically cacheable per the HTTP spec even without a Cache-Control
    // header. Without this, a transient API error (fixed server-side minutes
    // later, e.g. by a migration) can get stuck in the browser's disk cache
    // and keep replaying indefinitely, surviving normal reloads.
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});
