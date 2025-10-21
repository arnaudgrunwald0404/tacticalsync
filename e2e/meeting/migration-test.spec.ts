import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://pxirfndomjlqpkwfpqxq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4aXJmbmRvbWpscXBrd2ZwcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTc0NTg5NzAsImV4cCI6MjAxMzAzNDk3MH0.0LwKSt0yQZJq6P7bGIjRlrXRJqVIQXGrEVHoL-CMFK4',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

test.describe('Migration Test', () => {
  let teamId: string;
  let seriesId: string;
  let instanceId: string;
  let userId: string;

  test.beforeAll(async () => {
    // Create test user
    const { data: { user }, error: userError } = await supabase.auth.signUp({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(userError).toBeNull();
    expect(user).toBeTruthy();
    userId = user!.id;

    // Create test team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        name: 'Test Team',
        created_by: userId,
      })
      .select()
      .single();
    expect(teamError).toBeNull();
    expect(team).toBeTruthy();
    teamId = team!.id;

    // Add user as team member
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: teamId,
        user_id: userId,
        role: 'admin',
      });
    expect(memberError).toBeNull();
  });

  test('should create and manage meeting items', async () => {
    // Create meeting series
    const { data: series, error: seriesError } = await supabase
      .from('recurring_meetings')
      .insert({
        team_id: teamId,
        name: 'Test Meeting',
        frequency: 'weekly',
        created_by: userId,
      })
      .select()
      .single();
    expect(seriesError).toBeNull();
    expect(series).toBeTruthy();
    seriesId = series!.id;

    // Add agenda items
    const { data: agenda, error: agendaError } = await supabase
      .from('meeting_series_agenda')
      .insert({
        series_id: seriesId,
        title: 'Test Agenda Item',
        notes: 'Test notes',
        assigned_to: userId,
        time_minutes: 15,
        order_index: 0,
        created_by: userId,
      })
      .select()
      .single();
    expect(agendaError).toBeNull();
    expect(agenda).toBeTruthy();

    // Create meeting instance
    const { data: instance, error: instanceError } = await supabase
      .from('weekly_meetings')
      .insert({
        team_id: teamId,
        recurring_meeting_id: seriesId,
        week_start_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();
    expect(instanceError).toBeNull();
    expect(instance).toBeTruthy();
    instanceId = instance!.id;

    // Add priorities
    const { data: priority, error: priorityError } = await supabase
      .from('meeting_instance_priorities')
      .insert({
        instance_id: instanceId,
        title: 'Test Priority',
        outcome: 'Test outcome',
        activities: 'Test activities',
        assigned_to: userId,
        completion_status: 'not_completed',
        order_index: 0,
        created_by: userId,
      })
      .select()
      .single();
    expect(priorityError).toBeNull();
    expect(priority).toBeTruthy();

    // Add topics
    const { data: topic, error: topicError } = await supabase
      .from('meeting_instance_topics')
      .insert({
        instance_id: instanceId,
        title: 'Test Topic',
        notes: 'Test notes',
        assigned_to: userId,
        time_minutes: 10,
        completion_status: 'not_completed',
        order_index: 0,
        created_by: userId,
      })
      .select()
      .single();
    expect(topicError).toBeNull();
    expect(topic).toBeTruthy();

    // Add action items
    const { data: actionItem, error: actionItemError } = await supabase
      .from('meeting_series_action_items')
      .insert({
        series_id: seriesId,
        title: 'Test Action Item',
        notes: 'Test notes',
        assigned_to: userId,
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        completion_status: 'not_completed',
        order_index: 0,
        created_by: userId,
      })
      .select()
      .single();
    expect(actionItemError).toBeNull();
    expect(actionItem).toBeTruthy();

    // Add comments to each item type
    const commentTypes = [
      { itemId: agenda!.id, type: 'agenda' },
      { itemId: priority!.id, type: 'priority' },
      { itemId: topic!.id, type: 'topic' },
      { itemId: actionItem!.id, type: 'action_item' },
    ];

    for (const { itemId, type } of commentTypes) {
      const { error: commentError } = await supabase
        .from('comments')
        .insert({
          item_id: itemId,
          item_type: type,
          user_id: userId,
          content: `Test comment for ${type}`,
        });
      expect(commentError).toBeNull();
    }

    // Test updating items
    const updates = [
      {
        table: 'meeting_series_agenda',
        id: agenda!.id,
        updates: { title: 'Updated Agenda Item' },
      },
      {
        table: 'meeting_instance_priorities',
        id: priority!.id,
        updates: { title: 'Updated Priority', completion_status: 'completed' },
      },
      {
        table: 'meeting_instance_topics',
        id: topic!.id,
        updates: { title: 'Updated Topic', completion_status: 'completed' },
      },
      {
        table: 'meeting_series_action_items',
        id: actionItem!.id,
        updates: { title: 'Updated Action Item', completion_status: 'completed' },
      },
    ];

    for (const { table, id, updates } of updates) {
      const { error: updateError } = await supabase
        .from(table)
        .update(updates)
        .eq('id', id);
      expect(updateError).toBeNull();
    }

    // Test deleting items
    const deletes = [
      { table: 'meeting_series_agenda', id: agenda!.id },
      { table: 'meeting_instance_priorities', id: priority!.id },
      { table: 'meeting_instance_topics', id: topic!.id },
      { table: 'meeting_series_action_items', id: actionItem!.id },
    ];

    for (const { table, id } of deletes) {
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .eq('id', id);
      expect(deleteError).toBeNull();
    }
  });

  test.afterAll(async () => {
    // Clean up test data
    await supabase.from('team_members').delete().eq('team_id', teamId);
    await supabase.from('teams').delete().eq('id', teamId);
    await supabase.auth.admin.deleteUser(userId);
  });
});