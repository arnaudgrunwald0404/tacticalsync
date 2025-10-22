# Migration Guidelines

## 🚨 CRITICAL RULES - READ BEFORE CREATING MIGRATIONS

### 1. Timestamp Format
- **ALWAYS** use format: `YYYYMMDDHHMMSS_description.sql`
- **NEVER** use dates from the past (like `20250123` when it's actually 2025-10-23)
- **ALWAYS** use current timestamp when creating new migrations

### 2. Migration Order Dependencies
```
CRITICAL ORDER (DO NOT BREAK):
1. Basic tables (profiles, teams, team_members, invitations)
2. Meeting tables (meeting_series, meeting_instances)
3. Foreign key constraints
4. RLS policies
5. Triggers and functions
```

### 3. Before Creating a New Migration

#### Check Current Timestamp
```bash
# Get current timestamp for migration
date +"%Y%m%d%H%M%S"
```

#### Validate Existing Migrations
```bash
node scripts/validate-migrations.js
```

#### Check Database Health
```bash
node scripts/check-db-health.js
```

### 4. Migration Naming Convention
- Use descriptive names: `20251023120000_add_user_preferences.sql`
- Avoid generic names: `20251023120000_fix_stuff.sql`
- Include the main table being modified: `20251023120000_add_profiles_avatar_field.sql`

### 5. Common Mistakes to Avoid

#### ❌ WRONG - Past Timestamps
```
20250123000002_fix_team_members_profiles_relationship.sql
```

#### ✅ CORRECT - Current Timestamps
```
20251023120000_fix_team_members_profiles_relationship.sql
```

#### ❌ WRONG - References Before Creation
```sql
-- This migration tries to reference profiles before it's created
ALTER TABLE team_members 
ADD CONSTRAINT fk_user_profiles 
FOREIGN KEY (user_id) REFERENCES profiles(id);
```

#### ✅ CORRECT - Create First, Reference Later
```sql
-- First migration: Create profiles table
CREATE TABLE profiles (id UUID PRIMARY KEY, ...);

-- Later migration: Add foreign key constraint
ALTER TABLE team_members 
ADD CONSTRAINT fk_user_profiles 
FOREIGN KEY (user_id) REFERENCES profiles(id);
```

### 6. Testing Migrations

#### Before Committing
```bash
# 1. Validate migration order
node scripts/validate-migrations.js

# 2. Reset database to test
supabase db reset

# 3. Check database health
node scripts/check-db-health.js

# 4. Test your application
npm run dev
```

#### After Committing
```bash
# Always test on a fresh database
supabase db reset
npm run dev
```

### 7. Emergency Fixes

If you've already committed a migration with wrong timestamp:

#### Option 1: Rename the file (RECOMMENDED)
```bash
# Rename to correct timestamp
mv supabase/migrations/20250123000002_wrong.sql \
   supabase/migrations/20251023120000_correct.sql
```

#### Option 2: Create a new migration to fix
```bash
# Create new migration with current timestamp
supabase migration new fix_wrong_migration
```

### 8. Database Reset Checklist

Before running `supabase db reset`, always:

1. ✅ Backup any important data
2. ✅ Validate all migrations: `node scripts/validate-migrations.js`
3. ✅ Check current database health: `node scripts/check-db-health.js`
4. ✅ Run reset: `supabase db reset`
5. ✅ Verify tables exist: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\dt"`
6. ✅ Test application: `npm run dev`

### 9. Quick Commands Reference

```bash
# Get current timestamp for migration
date +"%Y%m%d%H%M%S"

# Validate migrations
node scripts/validate-migrations.js

# Check database health
node scripts/check-db-health.js

# Reset database
supabase db reset

# Check if tables exist
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\dt"

# Start development
npm run dev
```

## 🎯 Remember: Prevention is Better Than Fixing

- **Always** validate before committing
- **Always** test on fresh database
- **Always** use current timestamps
- **Always** follow the dependency order
- **Never** skip the validation steps
