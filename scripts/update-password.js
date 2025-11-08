import { createClient } from '@supabase/supabase-js';

// This script updates the password for agrunwald@clearcompany.com
// You need to set SUPABASE_SERVICE_ROLE_KEY environment variable
// or pass it as an argument

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pxirfndomjlqpkwfpqxq.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.argv[2];

if (!serviceRoleKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable or argument is required');
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=your-key node update-password.js');
  console.error('   or: node update-password.js your-service-role-key');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function updatePassword() {
  try {
    const email = 'agrunwald@clearcompany.com';
    const newPassword = '123456';

    // First, find the user by email
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      throw listError;
    }

    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      console.error(`Error: User with email ${email} not found`);
      process.exit(1);
    }

    console.log(`Found user: ${user.email} (ID: ${user.id})`);

    // Update the password
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (error) {
      throw error;
    }

    console.log(`✅ Password updated successfully for ${email}`);
    console.log(`   New password: ${newPassword}`);
  } catch (error) {
    console.error('Error updating password:', error?.message || error);
    process.exit(1);
  }
}

updatePassword();

