import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RZklsT8x3NUZFmH5coV_8R_M9WvUmQA5OiVJE';

const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function resetDatabase() {
  try {
    // Delete data in reverse order of dependencies
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
      console.log(`Cleaning up table: ${table}`);
      const { error } = await supabaseAdmin.from(table).delete();
      if (error) {
        console.error(`Error cleaning up table ${table}:`, error);
        throw error;
      }
    }

    // Delete all users
    console.log('Cleaning up users...');
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

    console.log('Database reset complete');
  } catch (error) {
    console.error('Failed to reset database:', error);
    throw error;
  }
}

async function verifyDatabaseState() {
  try {
    // Check each table is empty
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
      const { data, error } = await supabaseAdmin.from(table).select('count');
      if (error) {
        console.error(`Error checking table ${table}:`, error);
        throw error;
      }

      if (data && data[0].count > 0) {
        console.error(`Table ${table} is not empty: ${data[0].count} rows`);
        throw new Error(`Table ${table} is not empty`);
      }
    }

    // Check no users exist
    const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    if (usersError) {
      console.error('Error listing users:', usersError);
      throw usersError;
    }

    if (users.users.length > 0) {
      console.error(`Users table is not empty: ${users.users.length} users`);
      throw new Error('Users table is not empty');
    }

    console.log('Database state verified');
  } catch (error) {
    console.error('Failed to verify database state:', error);
    throw error;
  }
}

async function globalSetup() {
  try {
    console.log('Starting global setup...');

    // Set environment variables
    process.env.VITE_SUPABASE_URL = supabaseUrl;
    process.env.VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
    process.env.NODE_ENV = 'test';

    // Reset database to a clean state
    await resetDatabase();

    // Verify database is clean
    await verifyDatabaseState();

    console.log('Global setup complete');
  } catch (error) {
    console.error('Global setup failed:', error);
    throw error;
  }
}

export default globalSetup;