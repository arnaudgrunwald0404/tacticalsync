#!/usr/bin/env node

/**
 * Check User Admin Status Script
 * 
 * This script checks if a user has admin privileges
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

async function checkUserAdmin(email) {
  console.log(`🔍 Checking admin status for: ${email}\n`);
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, is_admin, is_super_admin, is_rcdo_admin, created_at')
      .eq('email', email)
      .maybeSingle();
    
    if (error) {
      console.error('❌ Error querying database:', error.message);
      process.exit(1);
    }
    
    if (!data) {
      console.log('❌ User not found in database');
      console.log(`💡 Make sure the user "${email}" exists in the profiles table`);
      process.exit(1);
    }
    
    console.log('📋 User Information:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Name:          ${data.full_name || 'Not set'}`);
    console.log(`Email:         ${data.email}`);
    console.log(`User ID:       ${data.id}`);
    console.log(`Created:       ${new Date(data.created_at).toLocaleString()}`);
    console.log('─────────────────────────────────────────────────────');
    console.log('\n🔐 Admin Privileges:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Super Admin:   ${data.is_super_admin ? '✅ YES' : '❌ NO'}`);
    console.log(`Admin:         ${data.is_admin ? '✅ YES' : '❌ NO'}`);
    console.log(`RCDO Admin:    ${data.is_rcdo_admin ? '✅ YES' : '❌ NO'}`);
    console.log('─────────────────────────────────────────────────────');
    
    // Determine overall status
    let status;
    if (data.is_super_admin) {
      status = '🌟 SUPER ADMIN - Full access to all teams, meetings, and RCDO features';
    } else if (data.is_admin && data.is_rcdo_admin) {
      status = '👑 ADMIN & RCDO ADMIN - Can create teams/meetings and manage RCDO cycles';
    } else if (data.is_admin) {
      status = '👤 ADMIN - Can create teams and meetings';
    } else if (data.is_rcdo_admin) {
      status = '📊 RCDO ADMIN - Can finalize/lock RCDO cycles';
    } else {
      status = '👥 REGULAR USER - No admin privileges';
    }
    
    console.log(`\n${status}\n`);
    
    // Show what permissions this gives
    console.log('📝 Permissions:');
    console.log('─────────────────────────────────────────────────────');
    if (data.is_super_admin) {
      console.log('• View all teams and meetings (even if not a member)');
      console.log('• Create teams and meetings');
      console.log('• Manage all RCDO cycles, rallying cries, and DOs');
      console.log('• Finalize and lock RCDO elements');
    } else if (data.is_admin) {
      console.log('• Create teams and meetings');
      console.log('• Member-level access to RCDO features');
    }
    if (data.is_rcdo_admin && !data.is_super_admin) {
      console.log('• Create and finalize RCDO cycles');
      console.log('• Lock/unlock rallying cries and DOs');
      console.log('• Manage strategic initiatives');
    }
    if (!data.is_admin && !data.is_super_admin && !data.is_rcdo_admin) {
      console.log('• View teams they are a member of');
      console.log('• Participate in meetings for their teams');
      console.log('• View company-wide RCDO content');
    }
    console.log('─────────────────────────────────────────────────────\n');
    
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    process.exit(1);
  }
}

// Get email from command line or use default
const email = process.argv[2] || 'agrunwald+test@clearcompany.com';
checkUserAdmin(email).catch(console.error);





