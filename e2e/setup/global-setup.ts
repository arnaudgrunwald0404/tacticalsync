import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RZklsT8x3NUZFmH5coV_8R_M9WvUmQA5OiVJE';

const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function globalSetup() {
  // Set environment variables
  process.env.VITE_SUPABASE_URL = supabaseUrl;
  process.env.VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  process.env.NODE_ENV = 'test';

  // Reset database to a clean state
  await resetDatabase();
}

async function resetDatabase() {
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

export default globalSetup;
