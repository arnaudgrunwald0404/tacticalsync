#!/usr/bin/env node

/**
 * Database Health Check Script
 * 
 * This script checks that all critical tables exist and are properly configured
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const CRITICAL_TABLES = [
  'profiles',
  'teams', 
  'team_members',
  'invitations',
  'meeting_series',
  'meeting_instances'
];

async function checkDatabaseHealth() {
  console.log('🏥 Checking database health...\n');
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const errors = [];
  const warnings = [];

  // Check if Supabase is running
  try {
    const { data, error } = await supabase.from('profiles').select('count').limit(1);
    if (error && error.code === 'PGRST205') {
      errors.push('❌ Database connection failed - Supabase might not be running');
      console.log('💡 Try running: supabase start');
      process.exit(1);
    }
  } catch (err) {
    errors.push('❌ Cannot connect to database');
    console.log('💡 Make sure Supabase is running: supabase start');
    process.exit(1);
  }

  // Check each critical table
  for (const table of CRITICAL_TABLES) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      
      if (error) {
        if (error.code === 'PGRST205') {
          errors.push(`❌ Table '${table}' does not exist`);
        } else {
          warnings.push(`⚠️  Table '${table}' has issues: ${error.message}`);
        }
      } else {
        console.log(`✅ Table '${table}' is accessible`);
      }
    } catch (err) {
      errors.push(`❌ Error checking table '${table}': ${err.message}`);
    }
  }

  // Check RLS policies
  try {
    const { data: policies } = await supabase.rpc('get_rls_policies');
    if (policies && policies.length > 0) {
      console.log(`✅ RLS policies are configured (${policies.length} policies)`);
    } else {
      warnings.push('⚠️  No RLS policies found - this might be expected for local development');
    }
  } catch (err) {
    warnings.push('⚠️  Could not check RLS policies');
  }

  // Report results
  if (errors.length > 0) {
    console.log('\n❌ DATABASE HEALTH CHECK FAILED:\n');
    errors.forEach(error => console.log(error));
    console.log('\n💡 Try running: supabase db reset');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:\n');
    warnings.forEach(warning => console.log(warning));
  }

  console.log('\n✅ Database is healthy!');
  console.log('🚀 You can now run your application');
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  checkDatabaseHealth().catch(console.error);
}

export { checkDatabaseHealth };
