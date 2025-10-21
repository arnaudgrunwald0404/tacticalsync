import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';

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

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export const testUsers = {
  admin: {
    email: 'test-admin@example.com',
    password: 'Test123456!',
  },
  member: {
    email: 'test-member@example.com',
    password: 'Test123456!',
  },
};

export async function createTestUser(
  email: string = testUsers.member.email,
  password: string = testUsers.member.password
): Promise<TestUser> {
  const { data: { user }, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) throw error;
  if (!user) throw new Error('User creation failed');

  return {
    id: user.id,
    email,
    password,
  };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}

export async function createTestUsers(): Promise<{
  admin: TestUser;
  member: TestUser;
}> {
  const admin = await createTestUser(testUsers.admin.email, testUsers.admin.password);
  const member = await createTestUser(testUsers.member.email, testUsers.member.password);
  return { admin, member };
}

export async function deleteTestUsers(users: { admin?: TestUser; member?: TestUser }): Promise<void> {
  if (users.admin) await deleteTestUser(users.admin.id);
  if (users.member) await deleteTestUser(users.member.id);
}
