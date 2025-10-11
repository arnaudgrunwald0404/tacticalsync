import { Page, expect } from '@playwright/test';
import { supabase } from './supabase.helper';

export interface TestInvitation {
  id: string;
  email: string;
  team_id: string;
  status: 'pending' | 'accepted' | 'revoked';
  invited_by: string;
}

/**
 * Send invitation via UI
 */
export async function sendInvitationViaUI(
  page: Page,
  teamId: string,
  email: string
): Promise<void> {
  await page.goto(`/team/${teamId}/invite`);
  
  // Find email input (may need to adjust selector based on UI)
  const emailInput = page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i));
  await emailInput.fill(email);
  
  // Click send button
  await page.getByRole('button', { name: /send|invite/i }).click();
  
  // Wait for success message
  await expect(page.getByText(/invited|sent/i)).toBeVisible({ timeout: 10000 });
}

/**
 * Create invitation directly via API
 */
export async function createInvitation(
  teamId: string,
  email: string,
  invitedBy: string
): Promise<TestInvitation> {
  const { data, error } = await supabase
    .from('invitations')
    .insert({
      team_id: teamId,
      email,
      invited_by: invitedBy,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get invitations for a team
 */
export async function getTeamInvitations(teamId: string): Promise<TestInvitation[]> {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('team_id', teamId);

  if (error) throw error;
  return data || [];
}

/**
 * Get invitation by email
 */
export async function getInvitationByEmail(
  teamId: string,
  email: string
): Promise<TestInvitation | null> {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('team_id', teamId)
    .eq('email', email)
    .single();

  if (error) return null;
  return data;
}

/**
 * Update invitation status
 */
export async function updateInvitationStatus(
  invitationId: string,
  status: 'pending' | 'accepted' | 'revoked'
): Promise<void> {
  const { error } = await supabase
    .from('invitations')
    .update({ status })
    .eq('id', invitationId);

  if (error) throw error;
}

/**
 * Revoke invitation
 */
export async function revokeInvitation(invitationId: string): Promise<void> {
  await updateInvitationStatus(invitationId, 'revoked');
}

/**
 * Delete invitation
 */
export async function deleteInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('id', invitationId);

  if (error) throw error;
}

/**
 * Get team invite code
 */
export async function getTeamInviteCode(teamId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('teams')
    .select('invite_code')
    .eq('id', teamId)
    .single();

  if (error || !data) return null;
  return data.invite_code;
}

/**
 * Generate new invite code for team
 */
export async function generateInviteCode(teamId: string): Promise<string> {
  // Generate a random code
  const code = Math.random().toString(36).substring(2, 10).toUpperCase();
  
  const { error } = await supabase
    .from('teams')
    .update({ invite_code: code })
    .eq('id', teamId);

  if (error) throw error;
  return code;
}

/**
 * Join team via invite code
 */
export async function joinTeamViaInviteCode(
  page: Page,
  inviteCode: string
): Promise<void> {
  await page.goto(`/join/${inviteCode}`);
  
  // Should process and redirect
  await page.waitForTimeout(2000);
}

/**
 * Accept invitation
 */
export async function acceptInvitation(
  page: Page,
  invitationId: string
): Promise<void> {
  // Navigate to invitation acceptance page/flow
  // Implementation depends on your UI
  await page.goto(`/accept-invitation/${invitationId}`);
}

