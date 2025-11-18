#!/usr/bin/env node
/**
 * Apply migrations to Supabase Production
 * Usage: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/apply-to-production.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = 'https://pxirfndomjlqpkwfpqxq.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function applySQL() {
  try {
    const sqlFile = path.join(__dirname, '..', 'APPLY_TO_PRODUCTION.sql');
    const sql = fs.readFileSync(sqlFile, 'utf-8');

    console.log('🚀 Applying migrations to PRODUCTION...');
    console.log(`📍 Supabase URL: ${supabaseUrl}`);
    console.log('');

    // Use Supabase REST API to execute SQL
    // Note: Supabase doesn't have a direct SQL execution endpoint in the JS client
    // We need to use the REST API with the service role key
    
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error executing SQL:', errorText);
      console.log('');
      console.log('⚠️  The REST API method may not work. Please use the SQL Editor instead:');
      console.log('   https://supabase.com/dashboard/project/pxirfndomjlqpkwfpqxq/sql');
      process.exit(1);
    }

    const result = await response.json();
    console.log('✅ SQL executed successfully!');
    console.log('Result:', result);
    console.log('');
    console.log('🎉 Migration complete! Please refresh your dashboard.');
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.log('');
    console.log('⚠️  Please use the SQL Editor instead:');
    console.log('   https://supabase.com/dashboard/project/pxirfndomjlqpkwfpqxq/sql');
    console.log('   Copy the contents of APPLY_TO_PRODUCTION.sql and paste it there.');
    process.exit(1);
  }
}

applySQL();




