import { Page, expect } from '@playwright/test';
import { supabase } from './supabase.helper';

export interface TestTeam {
  id: string;
  name: string;
  abbreviated_name?: string;
  invite_code?: string;
}

/**
 * Create a team via UI
 */
export async function createTeamViaUI(
  page: Page,
  teamName: string,
  abbreviatedName?: string
): Promise<void> {
  await page.goto('/create-team');
  
  await page.getByLabel(/team name/i).fill(teamName);
  
  if (abbreviatedName) {
    await page.getByLabel(/short name/i).fill(abbreviatedName);
  }
  
  await page.getByRole('button', { name: /create team/i }).click();
  
  // Wait for redirect to invite page or success
  await page.waitForURL(/\/team\/.*\/invite/, { timeout: 15000 });
}

/**
 * Create a team directly via API
 */
export async function createTeam(
  userId: string,
  teamName: string,
  abbreviatedName?: string
): Promise<TestTeam> {
  const { data: team, error } = await supabase
    .from('teams')
    .insert({
      name: teamName,
      abbreviated_name: abbreviatedName || null,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;

  // Add creator as admin
  await supabase.from('team_members').insert({
    team_id: team.id,
    user_id: userId,
    role: 'admin',
  });

  return team;
}

/**
 * Delete a team and all related data
 */
export async function deleteTeam(teamId: string): Promise<void> {
  try {
    // Delete team members first
    await supabase.from('team_members').delete().eq('team_id', teamId);
    
    // Delete invitations
    await supabase.from('invitations').delete().eq('team_id', teamId);
    
    // Delete meetings
    await supabase.from('weekly_meetings').delete().eq('team_id', teamId);
    
    // Delete team
    await supabase.from('teams').delete().eq('id', teamId);
  } catch (error) {
    console.warn(`Failed to delete team ${teamId}:`, error);
  }
}

/**
 * Add a member to a team
 */
export async function addTeamMember(
  teamId: string,
  userId: string,
  role: 'admin' | 'member' | 'viewer' = 'member'
): Promise<void> {
  const { error } = await supabase.from('team_members').insert({
    team_id: teamId,
    user_id: userId,
    role,
  });

  if (error) throw error;
}

/**
 * Remove a member from a team
 */
export async function removeTeamMember(
  teamId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId);

  if (error) throw error;
}

interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  created_at: string;
  profiles: unknown;
}

/**
 * Get team members
 */
export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*, profiles(*)')
    .eq('team_id', teamId);

  if (error) throw error;
  return data || [];
}

/**
 * Check if user is a member of a team
 */
export async function isTeamMember(
  teamId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();

  return !error && !!data;
}

/**
 * Get user's role in a team
 */
export async function getUserRole(
  teamId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data.role;
}

/**
 * Navigate to team dashboard
 */
export async function navigateToTeam(
  page: Page,
  teamId: string
): Promise<void> {
  await page.goto(`/team/${teamId}`);
}

/**
 * Navigate to team settings
 */
export async function navigateToTeamSettings(
  page: Page,
  teamId: string
): Promise<void> {
  await page.goto(`/team/${teamId}/settings`);
}

/**
 * Navigate to team invite page
 */
export async function navigateToTeamInvite(
  page: Page,
  teamId: string
): Promise<void> {
  await page.goto(`/team/${teamId}/invite`);
}

