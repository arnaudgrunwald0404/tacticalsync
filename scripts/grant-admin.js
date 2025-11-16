#!/usr/bin/env node

/**
 * Grant Admin Privileges Script
 * 
 * This script grants admin privileges to a user by email using direct SQL
 * to avoid RLS recursion issues.
 * 
 * Usage:
 *   node scripts/grant-admin.js <email> [admin-type]
 * 
 * Examples:
 *   node scripts/grant-admin.js user@example.com super
 *   node scripts/grant-admin.js user@example.com admin
 *   node scripts/grant-admin.js user@example.com rcdo
 *   node scripts/grant-admin.js user@example.com admin,rcdo
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Database connection for local development
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const ADMIN_TYPES = {
  super: {
    name: 'Super Admin',
    description: 'Full access to all teams, meetings, and RCDO features',
    flags: { is_super_admin: true, is_admin: true, is_rcdo_admin: true }
  },
  admin: {
    name: 'Admin',
    description: 'Can create teams and meetings',
    flags: { is_admin: true }
  },
  rcdo: {
    name: 'RCDO Admin',
    description: 'Can finalize/lock RCDO cycles, rallying cries, and DOs',
    flags: { is_rcdo_admin: true }
  }
};

function showUsage() {
  console.log(`
📖 Grant Admin Privileges Script

Usage:
  node scripts/grant-admin.js <email> [admin-type]

Admin Types:
  super       - Super Admin (full access to everything)
  admin       - Admin (can create teams and meetings)
  rcdo        - RCDO Admin (can manage RCDO features)
  admin,rcdo  - Both Admin and RCDO Admin

Examples:
  node scripts/grant-admin.js user@example.com super
  node scripts/grant-admin.js user@example.com admin
  node scripts/grant-admin.js user@example.com rcdo
  node scripts/grant-admin.js user@example.com admin,rcdo

If no admin-type is specified, defaults to 'admin'.
`);
}

function runSQL(query) {
  try {
    const result = execSync(`psql "${DB_URL}" -t -c "${query}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim();
  } catch (error) {
    throw new Error(`SQL Error: ${error.message}`);
  }
}

function parseRowResult(result) {
  if (!result || result === '(0 rows)') {
    return null;
  }
  
  const lines = result.split('\n').filter(line => line.trim() && line !== '(1 row)');
  if (lines.length === 0) return null;
  
  return lines[0].trim();
}

function grantAdminPrivileges(email, adminTypes = ['admin']) {
  console.log(`🔐 Granting admin privileges to: ${email}\n`);
  
  try {
    // Check if psql is available
    try {
      execSync('which psql', { stdio: 'ignore' });
    } catch {
      console.error('❌ psql command not found');
      console.error('💡 Please install PostgreSQL client tools or use the SQL method described in ADMIN_MANAGEMENT_GUIDE.md');
      process.exit(1);
    }
    
    // First, check if user exists
    console.log('🔍 Checking if user exists...');
    const checkQuery = `SELECT email, full_name, is_admin, is_super_admin, is_rcdo_admin FROM profiles WHERE email = '${email}';`;
    const userResult = runSQL(checkQuery);
    
    if (!userResult || userResult === '(0 rows)') {
      console.log('❌ User not found in database');
      console.log(`💡 Make sure the user "${email}" has signed up and created a profile`);
      process.exit(1);
    }
    
    // Parse current user data
    const userData = userResult.split('|').map(s => s.trim());
    const currentEmail = userData[0];
    const fullName = userData[1] || 'Not set';
    const isAdmin = userData[2] === 't';
    const isSuperAdmin = userData[3] === 't';
    const isRcdoAdmin = userData[4] === 't';
    
    console.log('✅ User found:');
    console.log(`   Name: ${fullName}`);
    console.log(`   Email: ${currentEmail}`);
    console.log('\n📋 Current Privileges:');
    console.log(`   Super Admin: ${isSuperAdmin ? '✅' : '❌'}`);
    console.log(`   Admin: ${isAdmin ? '✅' : '❌'}`);
    console.log(`   RCDO Admin: ${isRcdoAdmin ? '✅' : '❌'}`);
    
    // Build SET clause based on admin types
    const setValues = [];
    const grantedRoles = [];
    
    for (const type of adminTypes) {
      if (ADMIN_TYPES[type]) {
        const flags = ADMIN_TYPES[type].flags;
        if (flags.is_super_admin) setValues.push('is_super_admin = true', 'is_admin = true', 'is_rcdo_admin = true');
        if (flags.is_admin && !flags.is_super_admin) setValues.push('is_admin = true');
        if (flags.is_rcdo_admin && !flags.is_super_admin) setValues.push('is_rcdo_admin = true');
        grantedRoles.push(ADMIN_TYPES[type].name);
      }
    }
    
    if (setValues.length === 0) {
      console.error('\n❌ No valid admin types specified');
      showUsage();
      process.exit(1);
    }
    
    // Remove duplicates from setValues
    const uniqueSetValues = [...new Set(setValues)];
    
    // Update the user
    console.log(`\n🔄 Granting: ${grantedRoles.join(', ')}...`);
    
    const updateQuery = `UPDATE profiles SET ${uniqueSetValues.join(', ')}, updated_at = NOW() WHERE email = '${email}' RETURNING email, is_admin, is_super_admin, is_rcdo_admin;`;
    const updateResult = runSQL(updateQuery);
    
    if (!updateResult) {
      console.error('❌ Error updating user');
      process.exit(1);
    }
    
    // Parse updated user data
    const updatedData = updateResult.split('|').map(s => s.trim());
    const newIsAdmin = updatedData[1] === 't';
    const newIsSuperAdmin = updatedData[2] === 't';
    const newIsRcdoAdmin = updatedData[3] === 't';
    
    console.log('\n✅ Admin privileges granted successfully!\n');
    console.log('📋 New Privileges:');
    console.log(`   Super Admin: ${newIsSuperAdmin ? '✅' : '❌'}`);
    console.log(`   Admin: ${newIsAdmin ? '✅' : '❌'}`);
    console.log(`   RCDO Admin: ${newIsRcdoAdmin ? '✅' : '❌'}`);
    
    console.log('\n📝 What this user can now do:');
    if (newIsSuperAdmin) {
      console.log('   • View all teams and meetings (even if not a member)');
      console.log('   • Create teams and meetings');
      console.log('   • Manage all RCDO cycles, rallying cries, and DOs');
      console.log('   • Finalize and lock RCDO elements');
    } else {
      if (newIsAdmin) {
        console.log('   • Create teams and meetings');
      }
      if (newIsRcdoAdmin) {
        console.log('   • Create and finalize RCDO cycles');
        console.log('   • Lock/unlock rallying cries and DOs');
        console.log('   • Manage strategic initiatives');
      }
    }
    
    console.log('\n💡 The user may need to refresh their browser or log out/in to see the changes.\n');
    
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  showUsage();
  process.exit(0);
}

const email = args[0];
const adminTypeArg = args[1] || 'admin';
const adminTypes = adminTypeArg.split(',').map(t => t.trim().toLowerCase());

// Validate admin types
const invalidTypes = adminTypes.filter(t => !ADMIN_TYPES[t]);
if (invalidTypes.length > 0) {
  console.error(`❌ Invalid admin type(s): ${invalidTypes.join(', ')}`);
  console.error('Valid types are: super, admin, rcdo');
  showUsage();
  process.exit(1);
}

grantAdminPrivileges(email, adminTypes);

