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

  const { data, error } = await supabase
    .from('meeting_items')
    .insert({
      meeting_id: options.meetingId,
      type: options.type,
      title: options.title,
      notes: options.notes || '',
      assigned_to: options.assignedTo,
      due_date: options.dueDate,
      created_by: user.id,
      order_index: options.orderIndex || 0
    })
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
  const { error } = await supabase
    .from('meeting_items')
    .update({
      title: updates.title,
      notes: updates.notes,
      assigned_to: updates.assignedTo,
      due_date: updates.dueDate,
      is_completed: updates.isCompleted,
      order_index: updates.orderIndex
    })
    .eq('id', itemId);

  if (error) throw error;
}

export async function deleteMeetingItem(itemId: string) {
  const { error } = await supabase
    .from('meeting_items')
    .delete()
    .eq('id', itemId);

  if (error) throw error;
}

export async function getMeetingItem(itemId: string) {
  const { data, error } = await supabase
    .from('meeting_items')
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

  if (error) throw error;
  return data;
}

export async function getMeetingItems(meetingId: string, type?: 'action_item' | 'topic' | 'priority') {
  let query = supabase
    .from('meeting_items')
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
    .eq('meeting_id', meetingId)
    .order('order_index');

  if (type) {
    query = query.eq('type', type);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function cleanupMeetingItems(meetingId: string) {
  const { error } = await supabase
    .from('meeting_items')
    .delete()
    .eq('meeting_id', meetingId);

  if (error) throw error;
}
