import { test, expect } from '@playwright/test';
import { supabase } from './supabase.helper';

export async function createMeetingItem(options: {
  meetingId: string;
  type: 'action_item' | 'topic' | 'priority';
  title: string;
  notes?: string;
  assignedTo?: string;
  dueDate?: string;
  orderIndex?: number;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get the series_id from the meeting instance
  const { data: meetingData, error: meetingError } = await supabase
    .from('meeting_instances')
    .select('series_id')
    .eq('id', options.meetingId)
    .single();

  if (meetingError || !meetingData) throw meetingError || new Error('Meeting not found');

  let tableName: string;
  let insertData: any;

  switch (options.type) {
    case 'action_item':
      tableName = 'meeting_series_action_items';
      insertData = {
        series_id: meetingData.series_id,
        title: options.title,
        notes: options.notes || '',
        assigned_to: options.assignedTo,
        due_date: options.dueDate,
        created_by: user.id,
        order_index: options.orderIndex || 0
      };
      break;
    case 'topic':
      tableName = 'meeting_instance_topics';
      insertData = {
        instance_id: options.meetingId,
        title: options.title,
        notes: options.notes || '',
        assigned_to: options.assignedTo,
        created_by: user.id,
        order_index: options.orderIndex || 0
      };
      break;
    case 'priority':
      tableName = 'meeting_instance_priorities';
      insertData = {
        instance_id: options.meetingId,
        title: options.title,
        notes: options.notes || '',
        assigned_to: options.assignedTo,
        created_by: user.id,
        order_index: options.orderIndex || 0
      };
      break;
    default:
      throw new Error(`Unknown meeting item type: ${options.type}`);
  }

  const { data, error } = await supabase
    .from(tableName)
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMeetingItem(itemId: string, updates: {
  title?: string;
  notes?: string;
  assignedTo?: string;
  dueDate?: string;
  isCompleted?: boolean;
  orderIndex?: number;
}) {
  // Determine which table to update based on the item ID
  // We'll need to check each table to find the item
  const tables = ['meeting_series_action_items', 'meeting_instance_topics', 'meeting_instance_priorities'];
  
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .eq('id', itemId)
      .single();
    
    if (!error && data) {
      // Found the item in this table, update it
      const updateData: any = {
        title: updates.title,
        notes: updates.notes,
        assigned_to: updates.assignedTo,
        order_index: updates.orderIndex
      };
      
      // Only add due_date for action items
      if (table === 'meeting_series_action_items' && updates.dueDate !== undefined) {
        updateData.due_date = updates.dueDate;
      }
      
      // Handle completion status
      if (updates.isCompleted !== undefined) {
        updateData.completion_status = updates.isCompleted ? 'completed' : 'not_started';
      }
      
      const { error: updateError } = await supabase
        .from(table)
        .update(updateData)
        .eq('id', itemId);
      
      if (updateError) throw updateError;
      return;
    }
  }
  
  throw new Error('Meeting item not found');
}

export async function deleteMeetingItem(itemId: string) {
  // Try to delete from each table
  const tables = ['meeting_series_action_items', 'meeting_instance_topics', 'meeting_instance_priorities'];
  
  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', itemId);
    
    if (!error) {
      // Successfully deleted from this table
      return;
    }
  }
  
  throw new Error('Meeting item not found');
}

export async function getMeetingItem(itemId: string) {
  // Try to get the item from each table
  const tables = ['meeting_series_action_items', 'meeting_instance_topics', 'meeting_instance_priorities'];
  
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select(`
        *,
        assigned_to_profile:assigned_to(
          id,
          full_name,
          first_name,
          last_name,
          email,
          avatar_url,
          avatar_name
        )
      `)
      .eq('id', itemId)
      .single();
    
    if (!error && data) {
      return data;
    }
  }
  
  throw new Error('Meeting item not found');
}

export async function getMeetingItems(meetingId: string, type?: 'action_item' | 'topic' | 'priority') {
  const results: any[] = [];
  
  if (!type || type === 'action_item') {
    // Get action items from meeting_series_action_items
    const { data: meetingData, error: meetingError } = await supabase
      .from('meeting_instances')
      .select('series_id')
      .eq('id', meetingId)
      .single();
    
    if (!meetingError && meetingData) {
      const { data, error } = await supabase
        .from('meeting_series_action_items')
        .select(`
          *,
          assigned_to_profile:assigned_to(
            id,
            full_name,
            first_name,
            last_name,
            email,
            avatar_url,
            avatar_name
          )
        `)
        .eq('series_id', meetingData.series_id)
        .order('order_index');
      
      if (!error && data) {
        results.push(...data);
      }
    }
  }
  
  if (!type || type === 'topic') {
    // Get topics from meeting_instance_topics
    const { data, error } = await supabase
      .from('meeting_instance_topics')
      .select(`
        *,
        assigned_to_profile:assigned_to(
          id,
          full_name,
          first_name,
          last_name,
          email,
          avatar_url,
          avatar_name
        )
      `)
      .eq('instance_id', meetingId)
      .order('order_index');
    
    if (!error && data) {
      results.push(...data);
    }
  }
  
  if (!type || type === 'priority') {
    // Get priorities from meeting_instance_priorities
    const { data, error } = await supabase
      .from('meeting_instance_priorities')
      .select(`
        *,
        assigned_to_profile:assigned_to(
          id,
          full_name,
          first_name,
          last_name,
          email,
          avatar_url,
          avatar_name
        )
      `)
      .eq('instance_id', meetingId)
      .order('order_index');
    
    if (!error && data) {
      results.push(...data);
    }
  }
  
  return results;
}

export async function cleanupMeetingItems(meetingId: string) {
  // Get the series_id from the meeting instance
  const { data: meetingData, error: meetingError } = await supabase
    .from('meeting_instances')
    .select('series_id')
    .eq('id', meetingId)
    .single();

  if (!meetingError && meetingData) {
    // Delete action items from meeting_series_action_items
    const { error: actionItemsError } = await supabase
      .from('meeting_series_action_items')
      .delete()
      .eq('series_id', meetingData.series_id);
    
    if (actionItemsError) throw actionItemsError;
  }

  // Delete topics from meeting_instance_topics
  const { error: topicsError } = await supabase
    .from('meeting_instance_topics')
    .delete()
    .eq('instance_id', meetingId);

  if (topicsError) throw topicsError;

  // Delete priorities from meeting_instance_priorities
  const { error: prioritiesError } = await supabase
    .from('meeting_instance_priorities')
    .delete()
    .eq('instance_id', meetingId);

  if (prioritiesError) throw prioritiesError;
}
