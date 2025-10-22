#!/usr/bin/env node

/**
 * Migration Validation Script
 * 
 * This script validates that:
 * 1. All migrations are properly timestamped
 * 2. No duplicate timestamps exist
 * 3. Migrations are in chronological order
 * 4. Critical tables are created before being referenced
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = 'supabase/migrations';
const CRITICAL_TABLES = ['profiles', 'teams', 'team_members', 'invitations'];

function validateMigrations() {
  console.log('🔍 Validating migrations...\n');
  
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort();

  const errors = [];
  const warnings = [];
  const timestamps = new Set();

  // Check for duplicate timestamps
  migrationFiles.forEach(file => {
    const timestamp = file.split('_')[0];
    if (timestamps.has(timestamp)) {
      errors.push(`❌ Duplicate timestamp: ${timestamp} in file ${file}`);
    }
    timestamps.add(timestamp);
  });

  // Check timestamp format and ordering
  let lastTimestamp = null;
  migrationFiles.forEach(file => {
    const timestamp = file.split('_')[0];
    const dateMatch = timestamp.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    
    if (!dateMatch) {
      errors.push(`❌ Invalid timestamp format: ${timestamp} in file ${file}`);
      return;
    }

    const [, year, month, day, hour, minute, second] = dateMatch;
    const timestampDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    
    if (lastTimestamp && timestampDate <= lastTimestamp) {
      errors.push(`❌ Migration out of order: ${file} (${timestamp}) should come after previous migration`);
    }
    
    lastTimestamp = timestampDate;
  });

  // Check for critical table dependencies
  migrationFiles.forEach(file => {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    
    // Check if this migration creates critical tables
    const createsTables = CRITICAL_TABLES.some(table => 
      content.includes(`CREATE TABLE`) && content.includes(table)
    );
    
    if (createsTables) {
      console.log(`✅ ${file} creates critical tables`);
    }
    
    // Check for references to tables that might not exist yet
    CRITICAL_TABLES.forEach(table => {
      if (content.includes(`REFERENCES ${table}`) || content.includes(`FROM ${table}`)) {
        // This is a reference to a critical table - check if it's created in an earlier migration
        const currentIndex = migrationFiles.indexOf(file);
        const tableCreatedEarlier = migrationFiles.slice(0, currentIndex).some(earlierFile => {
          const earlierContent = fs.readFileSync(path.join(MIGRATIONS_DIR, earlierFile), 'utf8');
          return earlierContent.includes(`CREATE TABLE`) && earlierContent.includes(table);
        });
        
        if (!tableCreatedEarlier) {
          warnings.push(`⚠️  ${file} references ${table} but it might not be created yet`);
        }
      }
    });
  });

  // Report results
  if (errors.length > 0) {
    console.log('❌ VALIDATION FAILED:\n');
    errors.forEach(error => console.log(error));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log('⚠️  WARNINGS:\n');
    warnings.forEach(warning => console.log(warning));
  }

  console.log('✅ All migrations are valid!');
  console.log(`📊 Total migrations: ${migrationFiles.length}`);
  console.log(`📅 Date range: ${migrationFiles[0]?.split('_')[0]} to ${migrationFiles[migrationFiles.length - 1]?.split('_')[0]}`);
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  validateMigrations();
}

export { validateMigrations };
