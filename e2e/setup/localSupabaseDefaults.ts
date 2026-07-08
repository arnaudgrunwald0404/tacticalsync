/**
 * Default local Supabase credentials — not project secrets.
 *
 * `supabase start` provisions these exact anon/service_role JWTs on every
 * machine when run with the CLI's default config (this project's
 * supabase/config.toml does not override auth.jwt_secret, so it uses the
 * CLI's built-in default signing key). They are identical across every
 * local Supabase stack anywhere, scoped to nothing but 127.0.0.1:54321 —
 * there is no real secret here to rotate.
 *
 * Centralized in this one file (instead of duplicated as a literal across
 * ~20 e2e files) so a secret scanner has exactly one occurrence to
 * allowlist, and so the two service_role signature variants that had
 * silently drifted across files collapse back to a single, verified value.
 */
export const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';

export const LOCAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const LOCAL_SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
