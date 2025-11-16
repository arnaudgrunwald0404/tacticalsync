-- ============================================================================
-- Grant Admin Privileges to Users
-- ============================================================================
-- This script shows how to grant different types of admin privileges to users
--
-- ADMIN TYPES:
-- 1. is_super_admin: Full access to all teams, meetings, and RCDO features
-- 2. is_admin: Can create teams and meetings
-- 3. is_rcdo_admin: Can finalize/lock RCDO cycles, rallying cries, and DOs
--
-- USAGE:
-- Replace 'user@example.com' with the actual user's email address
-- ============================================================================

-- ----------------------------------------------------------------------------
-- METHOD 1: Grant Super Admin (includes all privileges)
-- ----------------------------------------------------------------------------
-- Super admins can do everything: see all teams/meetings, create teams, manage RCDO
UPDATE profiles 
SET 
  is_super_admin = true,
  is_admin = true,          -- Super admins should also have is_admin
  is_rcdo_admin = true,     -- Super admins should also have is_rcdo_admin
  updated_at = NOW()
WHERE email = 'user@example.com';

-- Verify the super admin was set
SELECT email, is_super_admin, is_admin, is_rcdo_admin 
FROM profiles 
WHERE email = 'user@example.com';


-- ----------------------------------------------------------------------------
-- METHOD 2: Grant Regular Admin (can create teams and meetings)
-- ----------------------------------------------------------------------------
-- Regular admins can create teams/meetings but don't see everything
UPDATE profiles 
SET 
  is_admin = true,
  updated_at = NOW()
WHERE email = 'user@example.com';

-- Verify the admin was set
SELECT email, is_super_admin, is_admin, is_rcdo_admin 
FROM profiles 
WHERE email = 'user@example.com';


-- ----------------------------------------------------------------------------
-- METHOD 3: Grant RCDO Admin (can manage RCDO features)
-- ----------------------------------------------------------------------------
-- RCDO admins can create/finalize RCDO cycles, lock/unlock elements
UPDATE profiles 
SET 
  is_rcdo_admin = true,
  updated_at = NOW()
WHERE email = 'user@example.com';

-- Verify the RCDO admin was set
SELECT email, is_super_admin, is_admin, is_rcdo_admin 
FROM profiles 
WHERE email = 'user@example.com';


-- ----------------------------------------------------------------------------
-- METHOD 4: Grant Multiple Admin Roles (Admin + RCDO Admin)
-- ----------------------------------------------------------------------------
-- Give user both admin and RCDO admin privileges
UPDATE profiles 
SET 
  is_admin = true,
  is_rcdo_admin = true,
  updated_at = NOW()
WHERE email = 'user@example.com';

-- Verify both roles were set
SELECT email, is_super_admin, is_admin, is_rcdo_admin 
FROM profiles 
WHERE email = 'user@example.com';


-- ----------------------------------------------------------------------------
-- METHOD 5: Revoke Admin Privileges
-- ----------------------------------------------------------------------------
-- Remove all admin privileges from a user
UPDATE profiles 
SET 
  is_super_admin = false,
  is_admin = false,
  is_rcdo_admin = false,
  updated_at = NOW()
WHERE email = 'user@example.com';

-- Verify privileges were revoked
SELECT email, is_super_admin, is_admin, is_rcdo_admin 
FROM profiles 
WHERE email = 'user@example.com';


-- ----------------------------------------------------------------------------
-- HELPER QUERIES: Check Admin Status
-- ----------------------------------------------------------------------------

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
  END as role,
  created_at,
  updated_at
FROM profiles
ORDER BY 
  is_super_admin DESC,
  is_admin DESC,
  is_rcdo_admin DESC,
  email ASC;


-- List all super admins
SELECT email, full_name, created_at
FROM profiles
WHERE is_super_admin = true
ORDER BY email;


-- List all admins (including super admins)
SELECT email, full_name, is_super_admin, created_at
FROM profiles
WHERE is_admin = true OR is_super_admin = true
ORDER BY is_super_admin DESC, email ASC;


-- List all RCDO admins
SELECT email, full_name, is_super_admin, is_admin, created_at
FROM profiles
WHERE is_rcdo_admin = true OR is_super_admin = true
ORDER BY is_super_admin DESC, email ASC;


-- Count users by role
SELECT 
  COUNT(*) FILTER (WHERE is_super_admin = true) as super_admins,
  COUNT(*) FILTER (WHERE is_admin = true AND is_super_admin = false) as admins,
  COUNT(*) FILTER (WHERE is_rcdo_admin = true AND is_super_admin = false) as rcdo_admins,
  COUNT(*) FILTER (WHERE is_admin = false AND is_super_admin = false AND is_rcdo_admin = false) as regular_users,
  COUNT(*) as total_users
FROM profiles;

