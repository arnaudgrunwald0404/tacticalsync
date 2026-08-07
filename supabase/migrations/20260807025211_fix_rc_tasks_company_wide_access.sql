-- Fix rc_tasks SELECT/INSERT RLS to match the company-wide RCDO model.
--
-- useRCDOPermissions.ts's canCreateTask() intentionally returns true for every
-- authenticated user (not just admins/owners), with the comment "This will be
-- enforced by RLS policies" -- but the RLS policy was never updated to match.
-- It still requires SI ownership, DO ownership, or a team_members row reached
-- via rc_cycles.team_id, a join that was already documented as dead in
-- 20260521000000_fix_rc_tasks_rls_admin_bypass.sql ("When cycles have
-- team_id = NULL (common), that join produces zero rows"). Every rc_cycles row
-- has team_id = NULL since 20251112100000_make_rcdo_company_wide.sql, so any
-- user who isn't the SI/DO owner or an admin gets a silent 42501 on INSERT --
-- reproduced live for a non-owner, non-admin account via the Add Task dialog.
--
-- rc_strategic_initiatives itself is already viewable company-wide
-- ("All authenticated users can view initiatives"), and the Task Owner picker
-- lists every profile in the company, so tasks are a company-wide,
-- assignable-to-anyone concept -- align SELECT/INSERT with that: any
-- authenticated user can view and create tasks, same as rc_links'
-- "Authenticated users can create links" policy from the same migration.
--
-- UPDATE/DELETE are left as-is: canEditTask/canDeleteTask client-side still
-- require task ownership, SI ownership, or admin, and the existing policies
-- already grant exactly that (the dead team-admin OR-clause is inert, not
-- blocking).

DROP POLICY IF EXISTS "Users can view tasks for accessible SIs" ON rc_tasks;

CREATE POLICY "All authenticated users can view tasks"
  ON rc_tasks FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can create tasks for accessible SIs" ON rc_tasks;

CREATE POLICY "Authenticated users can create tasks"
  ON rc_tasks FOR INSERT
  WITH CHECK (created_by = auth.uid());
