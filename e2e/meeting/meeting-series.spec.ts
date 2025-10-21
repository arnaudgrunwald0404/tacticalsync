import { test, expect } from '@playwright/test';
import { testClient as supabase } from '../helpers/test-client';

test.describe('Meeting Series Management', () => {
  let testUser: any;
  let testTeam: any;
  let recurringMeeting: any;
  let meetingInstance: any;

  test.beforeEach(async ({ page }) => {
    // Create test user and sign in
    const { data: { user }, error: userError } = await supabase.auth.signUp({
      email: `test-${Date.now()}@example.com`,
      password: 'testpassword123',
    });
    if (userError) throw userError;
    testUser = user;

    // Create test team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        name: `Test Team ${Date.now()}`,
        abbreviated_name: 'TEST',
      })
      .select()
      .single();
    if (teamError) throw teamError;
    testTeam = team;

    // Add user as team admin
    await supabase
      .from('team_members')
      .insert({
        team_id: team.id,
        user_id: user?.id,
        role: 'admin',
      });

    // Create recurring meeting
    const { data: meeting, error: meetingError } = await supabase
      .from('recurring_meetings')
      .insert({
        team_id: team.id,
        name: 'Weekly Tactical',
        frequency: 'weekly',
      })
      .select()
      .single();
    if (meetingError) throw meetingError;
    recurringMeeting = meeting;

    // Create meeting instance
    const today = new Date();
    const { data: instance, error: instanceError } = await supabase
      .from('meeting_instances')
      .insert({
        team_id: team.id,
        recurring_meeting_id: meeting.id,
        start_date: today.toISOString().split('T')[0],
      })
      .select()
      .single();
    if (instanceError) throw instanceError;
    meetingInstance = instance;

    // Sign in
    await page.goto('/auth/sign-in');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', 'testpassword123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('can create and manage agenda manually', async ({ page }) => {
    // Navigate to meeting
    await page.goto(`/team/${testTeam.id}/meeting/${meetingInstance.id}`);
    
    // Click "Start from Scratch"
    await page.click('text="Start From Scratch"');
    
    // Verify edit mode is active
    await expect(page.locator('text="Save"')).toBeVisible();
    
    // Add agenda item
    await page.fill('textarea[placeholder="Agenda item"]', 'Test Agenda Item');
    await page.fill('input[type="number"]', '15');
    
    // Save agenda
    await page.click('text="Save"');
    
    // Verify item was saved
    await expect(page.locator('text="Test Agenda Item"')).toBeVisible();
    await expect(page.locator('text="15 min"')).toBeVisible();
  });

  test('can adopt agenda template', async ({ page }) => {
    // Navigate to meeting
    await page.goto(`/team/${testTeam.id}/meeting/${meetingInstance.id}`);
    
    // Click "Use This Template" on Beem's Agenda
    await page.click('text="Use This Template"');
    
    // Verify template items are visible
    await expect(page.locator('text="Leader Opening Comments"')).toBeVisible();
    await expect(page.locator('text="Review Last Week\'s Items"')).toBeVisible();
    await expect(page.locator('text="Calendar Review"')).toBeVisible();
  });

  test('can add and manage priorities', async ({ page }) => {
    // Navigate to meeting
    await page.goto(`/team/${testTeam.id}/meeting/${meetingInstance.id}`);
    
    // Click "Add Priorities"
    await page.click('text="Add Priorities"');
    
    // Add priority
    await page.fill('textarea[placeholder="What\'s your priority?"]', 'Test Priority');
    await page.click('text="Add Priority"');
    
    // Verify priority was added
    await expect(page.locator('text="Test Priority"')).toBeVisible();
  });

  test('can add and manage team topics', async ({ page }) => {
    // Navigate to meeting
    await page.goto(`/team/${testTeam.id}/meeting/${meetingInstance.id}`);
    
    // Add topic
    await page.fill('input[placeholder="Topic title..."]', 'Test Topic');
    await page.fill('input[placeholder="...mins"]', '10');
    await page.click('button[aria-label="Add topic"]');
    
    // Verify topic was added
    await expect(page.locator('text="Test Topic"')).toBeVisible();
    await expect(page.locator('text="10 min"')).toBeVisible();
  });

  test('can add and manage action items', async ({ page }) => {
    // Navigate to meeting
    await page.goto(`/team/${testTeam.id}/meeting/${meetingInstance.id}`);
    
    // Add action item
    await page.fill('input[placeholder="Action item title..."]', 'Test Action Item');
    await page.click('button[aria-label="Add action item"]');
    
    // Verify action item was added
    await expect(page.locator('text="Test Action Item"')).toBeVisible();
  });

  test('can edit and update existing items', async ({ page }) => {
    // Navigate to meeting
    await page.goto(`/team/${testTeam.id}/meeting/${meetingInstance.id}`);
    
    // Add agenda item
    await page.click('text="Start From Scratch"');
    await page.fill('textarea[placeholder="Agenda item"]', 'Initial Agenda Item');
    await page.click('text="Save"');
    
    // Edit agenda item
    await page.click('button[aria-label="Edit agenda"]');
    await page.fill('textarea[placeholder="Agenda item"]', 'Updated Agenda Item');
    await page.click('text="Save"');
    
    // Verify update
    await expect(page.locator('text="Updated Agenda Item"')).toBeVisible();
  });

  test('handles concurrent edits gracefully', async ({ page, browser }) => {
    // First browser instance
    await page.goto(`/team/${testTeam.id}/meeting/${meetingInstance.id}`);
    
    // Second browser instance
    const page2 = await browser.newPage();
    await page2.goto(`/team/${testTeam.id}/meeting/${meetingInstance.id}`);
    
    // Edit in first browser
    await page.click('text="Start From Scratch"');
    await page.fill('textarea[placeholder="Agenda item"]', 'Edit from Browser 1');
    
    // Edit in second browser
    await page2.click('text="Start From Scratch"');
    await page2.fill('textarea[placeholder="Agenda item"]', 'Edit from Browser 2');
    
    // Save in first browser
    await page.click('text="Save"');
    
    // Save in second browser should show conflict warning
    await page2.click('text="Save"');
    await expect(page2.locator('text="Changes were made in another window"')).toBeVisible();
  });

  test.afterEach(async () => {
    // Clean up test data
    if (meetingInstance?.id) {
      await supabase
        .from('meeting_instances')
        .delete()
        .eq('id', meetingInstance.id);
    }
    
    if (recurringMeeting?.id) {
      await supabase
        .from('recurring_meetings')
        .delete()
        .eq('id', recurringMeeting.id);
    }
    
    if (testTeam?.id) {
      await supabase
        .from('teams')
        .delete()
        .eq('id', testTeam.id);
    }
    
    if (testUser?.id) {
      await supabase.auth.admin.deleteUser(testUser.id);
    }
  });
});
