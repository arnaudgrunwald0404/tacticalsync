# Admin Management Guide

This guide explains how to grant and manage admin privileges for users in the Tactical Sync application.

## 📋 Table of Contents

- [Admin Types](#admin-types)
- [Methods to Grant Admin Privileges](#methods-to-grant-admin-privileges)
  - [Method 1: Using the Script (Recommended)](#method-1-using-the-script-recommended)
  - [Method 2: Using SQL Directly](#method-2-using-sql-directly)
  - [Method 3: Using the Settings Page](#method-3-using-the-settings-page)
- [Checking Admin Status](#checking-admin-status)
- [Revoking Admin Privileges](#revoking-admin-privileges)
- [Troubleshooting](#troubleshooting)

---

## 🎭 Admin Types

Your application has three types of admin privileges:

### 1. **Super Admin** (`is_super_admin`)
- **Full access** to everything
- Can view all teams and meetings (even if not a member)
- Can create teams and meetings
- Can manage all RCDO cycles, rallying cries, and DOs
- Can finalize and lock RCDO elements
- **Automatically includes Admin and RCDO Admin privileges**

### 2. **Admin** (`is_admin`)
- Can create teams
- Can create meetings
- Can manage teams they are a member of
- Member-level access to RCDO features

### 3. **RCDO Admin** (`is_rcdo_admin`)
- Can create RCDO cycles
- Can finalize/activate RCDO cycles
- Can lock/unlock rallying cries
- Can lock/unlock defining objectives
- Can manage strategic initiatives
- Does **not** grant team/meeting creation privileges

### 4. **Combined Roles**
You can grant multiple admin roles to the same user. For example:
- **Admin + RCDO Admin**: Can create teams/meetings AND manage RCDO features
- **Super Admin**: Automatically includes all privileges

---

## 🔧 Methods to Grant Admin Privileges

### Method 1: Using the Script (Recommended)

The easiest way to grant admin privileges is using the Node.js script:

```bash
# Grant Admin privileges (can create teams and meetings)
node scripts/grant-admin.js user@example.com admin

# Grant Super Admin privileges (full access)
node scripts/grant-admin.js user@example.com super

# Grant RCDO Admin privileges (can manage RCDO features)
node scripts/grant-admin.js user@example.com rcdo

# Grant both Admin and RCDO Admin privileges
node scripts/grant-admin.js user@example.com admin,rcdo
```

**Example Output:**
```
🔐 Granting admin privileges to: user@example.com

✅ User found:
   Name: John Doe
   Email: user@example.com

📋 Current Privileges:
   Super Admin: ❌
   Admin: ❌
   RCDO Admin: ❌

🔄 Granting: Admin...

✅ Admin privileges granted successfully!

📋 New Privileges:
   Super Admin: ❌
   Admin: ✅
   RCDO Admin: ❌
```

---

### Method 2: Using SQL Directly

You can run SQL commands directly using either:

**Option A: Via psql (Supabase CLI)**
```bash
# For local development
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

**Option B: Via Supabase Dashboard**
1. Go to your Supabase project
2. Navigate to SQL Editor
3. Run the SQL commands below

#### Grant Super Admin:
```sql
UPDATE profiles 
SET 
  is_super_admin = true,
  is_admin = true,
  is_rcdo_admin = true,
  updated_at = NOW()
WHERE email = 'user@example.com';
```

#### Grant Admin:
```sql
UPDATE profiles 
SET 
  is_admin = true,
  updated_at = NOW()
WHERE email = 'user@example.com';
```

#### Grant RCDO Admin:
```sql
UPDATE profiles 
SET 
  is_rcdo_admin = true,
  updated_at = NOW()
WHERE email = 'user@example.com';
```

#### Grant Both Admin and RCDO Admin:
```sql
UPDATE profiles 
SET 
  is_admin = true,
  is_rcdo_admin = true,
  updated_at = NOW()
WHERE email = 'user@example.com';
```

---

### Method 3: Using the Settings Page

If you are already a Super Admin, you can grant admin privileges through the UI:

1. Log in as a Super Admin
2. Navigate to **Settings** page
3. Find the user in the user list
4. Click the **Edit** button
5. Check the appropriate admin checkboxes:
   - **Super Admin**
   - **Admin**
   - **RCDO Admin**
6. Click **Save**

---

## 🔍 Checking Admin Status

### Check a Specific User:

**Using the script:**
```bash
node scripts/check-user-admin.js user@example.com
```

**Using SQL:**
```sql
SELECT 
  email,
  full_name,
  is_super_admin,
  is_admin,
  is_rcdo_admin,
  CASE
    WHEN is_super_admin = true THEN 'Super Admin'
    WHEN is_admin = true AND is_rcdo_admin = true THEN 'Admin + RCDO Admin'
    WHEN is_admin = true THEN 'Admin'
    WHEN is_rcdo_admin = true THEN 'RCDO Admin'
    ELSE 'Regular User'
  END as role
FROM profiles
WHERE email = 'user@example.com';
```

### List All Admins:

```sql
-- See all users with their admin status
SELECT 
  email,
  full_name,
  is_super_admin,
  is_admin,
  is_rcdo_admin,
  CASE
    WHEN is_super_admin = true THEN 'Super Admin'
    WHEN is_admin = true AND is_rcdo_admin = true THEN 'Admin + RCDO Admin'
    WHEN is_admin = true THEN 'Admin'
    WHEN is_rcdo_admin = true THEN 'RCDO Admin'
    ELSE 'Regular User'
  END as role
FROM profiles
WHERE is_admin = true OR is_super_admin = true OR is_rcdo_admin = true
ORDER BY is_super_admin DESC, is_admin DESC, email ASC;
```

### Count Users by Role:

```sql
SELECT 
  COUNT(*) FILTER (WHERE is_super_admin = true) as super_admins,
  COUNT(*) FILTER (WHERE is_admin = true AND is_super_admin = false) as admins,
  COUNT(*) FILTER (WHERE is_rcdo_admin = true AND is_super_admin = false) as rcdo_admins,
  COUNT(*) FILTER (WHERE is_admin = false AND is_super_admin = false AND is_rcdo_admin = false) as regular_users,
  COUNT(*) as total_users
FROM profiles;
```

---

## ❌ Revoking Admin Privileges

### Revoke All Admin Privileges:

**Using SQL:**
```sql
UPDATE profiles 
SET 
  is_super_admin = false,
  is_admin = false,
  is_rcdo_admin = false,
  updated_at = NOW()
WHERE email = 'user@example.com';
```

### Revoke Specific Privileges:

```sql
-- Revoke only Super Admin (keep other admin roles)
UPDATE profiles 
SET is_super_admin = false, updated_at = NOW()
WHERE email = 'user@example.com';

-- Revoke only Admin (keep RCDO Admin if set)
UPDATE profiles 
SET is_admin = false, updated_at = NOW()
WHERE email = 'user@example.com';

-- Revoke only RCDO Admin (keep other admin roles)
UPDATE profiles 
SET is_rcdo_admin = false, updated_at = NOW()
WHERE email = 'user@example.com';
```

---

## 🔧 Troubleshooting

### Issue: "User not found in database"

**Cause:** The user hasn't signed up or their profile hasn't been created yet.

**Solution:**
1. Make sure the user has signed up through the application
2. The profile should be automatically created on first sign-in
3. If using local development, make sure Supabase is running: `supabase start`

### Issue: "Error querying database: infinite recursion detected"

**Cause:** Row Level Security (RLS) policies on the profiles table are causing recursion.

**Solution:** Use SQL directly via psql instead of the API:
```bash
# Local development
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Then run your UPDATE query
UPDATE profiles SET is_admin = true WHERE email = 'user@example.com';
```

### Issue: "Changes not reflected in the UI"

**Cause:** The frontend has cached the user's role information.

**Solution:**
1. Have the user log out and log back in
2. Or have them refresh the browser
3. The `useRoles` hook checks the database on each session

### Issue: "Permission denied"

**Cause:** You're trying to modify admin privileges without proper permissions.

**Solution:**
1. Make sure you're using the service role key for admin operations
2. Or connect directly to the database using psql with superuser credentials
3. For local development: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`

---

## 📚 Additional Resources

- **SQL Reference:** See `scripts/grant-admin-privileges.sql` for all SQL commands
- **Script Reference:** Run `node scripts/grant-admin.js --help` for usage
- **Database Schema:** Check the `profiles` table in your Supabase dashboard
- **RLS Policies:** See `supabase/migrations/` for Row Level Security configurations

---

## 🚨 Important Notes

1. **Super Admin by Email:** The email `agrunwald@clearcompany.com` is hardcoded as a super admin in the codebase (`src/hooks/useRoles.ts`)

2. **Database Sync:** When setting `is_super_admin = true`, the application automatically syncs to the `super_admins` table to avoid RLS recursion issues

3. **Production Safety:** Always be careful when granting Super Admin privileges in production environments

4. **Audit Trail:** Consider logging admin privilege changes for security audit purposes

5. **User Notification:** Users need to refresh or re-login to see privilege changes take effect

