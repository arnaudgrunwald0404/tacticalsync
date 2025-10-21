import { Page } from '@playwright/test';
import { supabaseAdmin } from './supabase.helper';
import { testTeams, type TestTeam } from '../fixtures/teams';
import type { TestUser } from '../fixtures/users';

export { testTeams, type TestTeam } from '../fixtures/teams';

export async function createTeam(
  createdBy: string,
  name: string = testTeams.engineering.name,
  abbreviatedName: string = testTeams.engineering.abbreviated_name
): Promise<TestTeam> {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .insert({
      name,
      abbreviated_name: abbreviatedName,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createTeamViaUI(
  page: Page,
  name: string,
  abbreviatedName?: string
): Promise<void> {
  await page.goto('/create-team');
  await page.fill('input[name="name"]', name);
  if (abbreviatedName) {
    await page.fill('input[name="abbreviated_name"]', abbreviatedName);
  }
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');
}

export async function addTeamMember(
  teamId: string,
  userId: string,
  role: 'admin' | 'member' = 'member'
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('team_members')
    .insert({
      team_id: teamId,
      user_id: userId,
      role,
    });

  if (error) throw error;
}

export async function removeTeamMember(
  teamId: string,
  userId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function isTeamMember(
  teamId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select()
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();

  if (error) return false;
  return !!data;
}

export async function getTeamRole(
  teamId: string,
  userId: string
): Promise<'admin' | 'member' | null> {
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data.role as 'admin' | 'member';
}

export async function deleteTeam(teamId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('teams')
    .delete()
    .eq('id', teamId);

  if (error) throw error;
}

export async function navigateToTeamInvite(
  page: Page,
  teamId: string
): Promise<void> {
  await page.goto(`/team/${teamId}/settings`);
  await page.click('text=Invite Members');
  await page.waitForURL(`/team/${teamId}/invite`);
}

export async function setupTestTeam(
  admin: TestUser,
  options: {
    name?: string;
    abbreviatedName?: string;
    members?: TestUser[];
  } = {}
): Promise<{
  team: TestTeam;
  members: { user: TestUser; role: 'admin' | 'member' }[];
}> {
  // Create team
  const team = await createTeam(
    admin.id,
    options.name || testTeams.engineering.name,
    options.abbreviatedName || testTeams.engineering.abbreviated_name
  );

  // Add members
  const members = [{ user: admin, role: 'admin' as const }];
  if (options.members) {
    for (const member of options.members) {
      await addTeamMember(team.id, member.id, 'member');
      members.push({ user: member, role: 'member' as const });
    }
  }

  return { team, members };
}

export async function cleanupTestTeam(
  team: TestTeam,
  members: { user: TestUser; role: 'admin' | 'member' }[]
): Promise<void> {
  // Remove members
  for (const member of members) {
    await removeTeamMember(team.id, member.user.id);
  }

  // Delete team
  await deleteTeam(team.id);
}