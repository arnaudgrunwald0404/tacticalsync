import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';
import { LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON_KEY, LOCAL_SUPABASE_SERVICE_ROLE_KEY } from '../setup/localSupabaseDefaults';

const supabaseUrl = process.env.VITE_SUPABASE_URL || LOCAL_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || LOCAL_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || LOCAL_SUPABASE_SERVICE_ROLE_KEY;

// Client for user operations (anon key)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Client for admin operations (service key)
export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Helper function to clear test data
export async function clearTestData() {
  const tables = [
    'comments',
    'meeting_series_action_items',
    'meeting_instance_topics',
    'meeting_instance_priorities',
    'meeting_series_agenda',
    'meeting_instances',
    'recurring_meetings',
    'team_members',
    'teams',
    'profiles',
  ];

  for (const table of tables) {
    const { error } = await supabaseAdmin.from(table).delete();
    if (error) {
      console.error(`Error clearing table ${table}:`, error);
      throw error;
    }
  }

  // Delete all users
  const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
  if (usersError) {
    console.error('Error listing users:', usersError);
    throw usersError;
  }

  for (const user of users.users) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (error) {
      console.error(`Error deleting user ${user.id}:`, error);
      throw error;
    }
  }
}

// Helper function to get test database URL
export function getTestDatabaseUrl(): string {
  return supabaseUrl;
}

// Helper function to get test database anon key
export function getTestDatabaseAnonKey(): string {
  return supabaseAnonKey;
}

// Helper function to get test database service key
export function getTestDatabaseServiceKey(): string {
  return supabaseServiceKey;
}