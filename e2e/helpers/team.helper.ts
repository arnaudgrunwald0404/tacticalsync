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