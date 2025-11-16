-- ============================================================================
-- Fix RCDO Tables to Reference Profiles Instead of Auth.Users
-- ============================================================================
-- This migration updates the RCDO tables to reference the profiles table
-- directly instead of auth.users, which allows PostgREST to properly resolve
-- the foreign key relationships when querying with Supabase.
--
-- Since profiles.id references auth.users.id with ON DELETE CASCADE,
-- this maintains the same referential integrity while enabling proper joins.
-- ============================================================================

-- Drop existing foreign key constraints and recreate them to reference profiles
-- This is safe because profiles.id = auth.users.id

-- RC Rallying Cries
ALTER TABLE rc_rallying_cries
  DROP CONSTRAINT IF EXISTS rc_rallying_cries_owner_user_id_fkey,
  DROP CONSTRAINT IF EXISTS rc_rallying_cries_locked_by_fkey,
  ADD CONSTRAINT rc_rallying_cries_owner_user_id_fkey 
    FOREIGN KEY (owner_user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT rc_rallying_cries_locked_by_fkey 
    FOREIGN KEY (locked_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- RC Defining Objectives
ALTER TABLE rc_defining_objectives
  DROP CONSTRAINT IF EXISTS rc_defining_objectives_owner_user_id_fkey,
  DROP CONSTRAINT IF EXISTS rc_defining_objectives_locked_by_fkey,
  ADD CONSTRAINT rc_defining_objectives_owner_user_id_fkey 
    FOREIGN KEY (owner_user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT rc_defining_objectives_locked_by_fkey 
    FOREIGN KEY (locked_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- RC Strategic Initiatives
ALTER TABLE rc_strategic_initiatives
  DROP CONSTRAINT IF EXISTS rc_strategic_initiatives_owner_user_id_fkey,
  ADD CONSTRAINT rc_strategic_initiatives_owner_user_id_fkey 
    FOREIGN KEY (owner_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- RC Cycles (created_by)
ALTER TABLE rc_cycles
  DROP CONSTRAINT IF EXISTS rc_cycles_created_by_fkey,
  ADD CONSTRAINT rc_cycles_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

