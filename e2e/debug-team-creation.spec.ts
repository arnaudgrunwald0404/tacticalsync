import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase.helper';

test('debug team creation', async () => {
  console.log('Testing team creation with service key...');
  
  try {
    // First, create a test user
    const testEmail = `debug-team-${Date.now()}@example.com`;
    const testPassword = 'testpass123';
    
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    if (userError || !user) {
      throw new Error(`Failed to create user: ${userError?.message}`);
    }

    console.log('User created:', user.id);

    // Now try to create a team
    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .insert({
        name: 'Debug Team',
        created_by: user.id,
      })
      .select()
      .single();

    if (teamError) {
      console.error('Team creation error:', teamError);
      throw new Error(`Failed to create team: ${teamError.message}`);
    }

    console.log('Team created:', team.id);

    // Clean up
    await supabaseAdmin.auth.admin.deleteUser(user.id);
    console.log('Cleanup completed');

  } catch (error) {
    console.error('Debug test failed:', error);
    throw error;
  }
});
