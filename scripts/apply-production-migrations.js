import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const supabaseUrl = 'https://pxirfndomjlqpkwfpqxq.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function applyMigrations() {
  try {
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'APPLY_TO_PRODUCTION.sql');
    const sql = fs.readFileSync(sqlFile, 'utf-8');

    console.log('Applying migrations to production...');
    console.log(`Supabase URL: ${supabaseUrl}`);
    console.log('');

    // Split SQL into individual statements (simple approach - split by semicolon)
    // Note: This is a simplified approach. For production, you might want to use a proper SQL parser
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && s !== 'SELECT \'All migrations applied successfully!\' as status');

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      if (statement.trim().length === 0) continue;
      
      try {
        // Use RPC call or direct query
        // Note: Supabase JS client doesn't have a direct SQL execution method
        // We need to use the REST API or psql
        console.log(`Executing: ${statement.substring(0, 100)}...`);
        
        // For now, we'll need to use the REST API endpoint
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: statement }),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error(`Error: ${error}`);
          errorCount++;
        } else {
          successCount++;
        }
      } catch (error: any) {
        console.error(`Error executing statement: ${error.message}`);
        errorCount++;
      }
    }

    console.log('');
    console.log(`✅ Successfully executed: ${successCount} statements`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount} statements`);
    }
    console.log('');
    console.log('Migration complete! Please refresh your dashboard.');
  } catch (error: any) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

applyMigrations();

