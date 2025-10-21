import { supabase } from '../src/integrations/supabase/client';

async function globalSetup() {
  // Set up test environment variables
  process.env.NODE_ENV = 'test';
  process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

  // Configure Supabase client for tests
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      // Clear any cached data
      localStorage.clear();
    }
  });
}

export default globalSetup;