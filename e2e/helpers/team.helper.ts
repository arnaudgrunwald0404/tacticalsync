import { Page } from '@playwright/test';
import { supabase } from './supabase.helper';

export interface TestTeam {
  id: string;
  name: string;
  abbreviated_name: string;
  created_by: string;
}

export async function createTeam(
  userId: string,
  name: string,
  abbreviatedName?: string
): Promise<TestTeam> {
  const { data, error } = await supabase
    .from('teams')
    .insert({
      name,
      abbreviated_name: abbreviatedName || name.split(' ').map(word => word[0]).join('').toUpperCase(),
      created_by: userId,
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

export async function deleteTeam(teamId: string): Promise<void> {
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId);

  if (error) throw error;
}

export async function addTeamMember(
  teamId: string,
  userId: string,
  role: 'admin' | 'member' = 'member'
): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .insert({
      team_id: teamId,
      user_id: userId,
      role,
    });

  if (error) throw error;
}

export async function isTeamMember(
  teamId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('team_members')
    .select()
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();

  if (error) return false;
  return !!data;
}

export async function navigateToTeamInvite(
  page: Page,
  teamId: string
): Promise<void> {
  await page.goto(`/team/${teamId}/settings`);
  await page.click('text=Invite Members');
  await page.waitForURL(`/team/${teamId}/invite`);
}