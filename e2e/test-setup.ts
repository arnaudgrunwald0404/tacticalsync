import { supabase } from '../src/integrations/supabase/client';

async function globalSetup() {
  // Set up test environment variables
  process.env.NODE_ENV = 'test';
  process.env.VITE_SUPABASE_URL = 'https://pxirfndomjlqpkwfpqxq.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4aXJmbmRvbWpscXBrd2ZwcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTc0NTg5NzAsImV4cCI6MjAxMzAzNDk3MH0.0LwKSt0yQZJq6P7bGIjRlrXRJqVIQXGrEVHoL-CMFK4';

  // Configure Supabase client for tests
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      // Clear any cached data
      localStorage.clear();
    }
  });
}

export default globalSetup;