import { test, expect } from './setup/test-setup';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/integrations/supabase/types';

const supabaseAdmin = createClient<Database>(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

test('test service key works', async ({ page }) => {
  // Test creating a user directly with the service key
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'testpass123';
  
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    if (error) {
      console.error('Service key test failed:', error);
      throw error;
    }

    if (!user) {
      throw new Error('User creation failed');
    }

    console.log('Service key test passed - user created:', user.id);
    
    // Clean up
    await supabaseAdmin.auth.admin.deleteUser(user.id);
    
    expect(user.email).toBe(testEmail);
  } catch (error) {
    console.error('Service key test error:', error);
    throw error;
  }
});
