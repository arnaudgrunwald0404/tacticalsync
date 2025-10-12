import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for test helpers
// These should use service role key for admin operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing Supabase credentials. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Clean up test data from database
 */
export async function cleanupTestData(email?: string, teamId?: string): Promise<void> {
  try {
    // Clean up team memberships if teamId provided
    if (teamId) {
      await supabase.from('team_members').delete().eq('team_id', teamId);
      await supabase.from('teams').delete().eq('id', teamId);
    }

    // Clean up user if email provided
    if (email) {
      const { data: user } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (user) {
        await supabase.auth.admin.deleteUser(user.id);
      }
    }
  } catch (error) {
    console.warn('Cleanup failed:', error);
  }
}

/**
 * Wait for database record to exist
 */
export async function waitForRecord(
  table: string,
  condition: Record<string, unknown>,
  maxAttempts: number = 10,
  delayMs: number = 500
): Promise<unknown> {
  for (let i = 0; i < maxAttempts; i++) {
    const query = supabase.from(table).select('*');
    
    // Apply all conditions
    Object.entries(condition).forEach(([key, value]) => {
      query.eq(key, value);
    });

    const { data, error } = await query.single();

    if (!error && data) {
      return data;
    }

    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error(`Record not found in ${table} after ${maxAttempts} attempts`);
}

