import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';
import { LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY } from './localSupabaseDefaults';

const supabaseUrl = LOCAL_SUPABASE_URL;
const supabaseServiceKey = LOCAL_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function globalTeardown() {
  // Clean up any remaining test data
  await cleanupTestData();
}

async function cleanupTestData() {
  // Delete all data from tables in reverse order of dependencies
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
    const { error } = await supabase.from(table).delete();
    if (error) {
      console.error(`Error clearing table ${table}:`, error);
      throw error;
    }
  }

  // Delete all users
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) {
    console.error('Error listing users:', usersError);
    throw usersError;
  }

  for (const user of users.users) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      console.error(`Error deleting user ${user.id}:`, error);
      throw error;
    }
  }
}

export default globalTeardown;
