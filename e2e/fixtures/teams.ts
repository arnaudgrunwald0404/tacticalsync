import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';
import type { TestUser } from './users';

const supabase = createClient<Database>(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RZklsT8x3NUZFmH5coV_8R_M9WvUmQA5OiVJE',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export interface TestTeam {
  id: string;
  name: string;
  abbreviated_name: string;
  created_by: string;
}

export const testTeams = {
  engineering: {
    name: 'Engineering Team',
    abbreviated_name: 'ENG',
  },
  product: {
    name: 'Product Team',
    abbreviated_name: 'PROD',
  },
};

export async function createTestTeam(
  createdBy: string,
  name: string = testTeams.engineering.name,
  abbreviatedName: string = testTeams.engineering.abbreviated_name
): Promise<TestTeam> {
  const { data, error } = await supabase
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

export async function deleteTestTeam(teamId: string): Promise<void> {
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId);

  if (error) throw error;
}

export async function createTestTeams(admin: TestUser): Promise<{
  engineering: TestTeam;
  product: TestTeam;
}> {
  const engineering = await createTestTeam(
    admin.id,
    testTeams.engineering.name,
    testTeams.engineering.abbreviated_name
  );

  const product = await createTestTeam(
    admin.id,
    testTeams.product.name,
    testTeams.product.abbreviated_name
  );

  return { engineering, product };
}

export async function deleteTestTeams(teams: { engineering?: TestTeam; product?: TestTeam }): Promise<void> {
  if (teams.engineering) await deleteTestTeam(teams.engineering.id);
  if (teams.product) await deleteTestTeam(teams.product.id);
}
