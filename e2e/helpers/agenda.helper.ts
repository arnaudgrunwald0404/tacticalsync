import { Page, expect } from '@playwright/test';
import { supabase } from './supabase.helper';

export interface TestAgendaTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_system?: boolean;
}

export interface TestAgendaTemplateItem {
  id: string;
  template_id: string;
  title: string;
  duration_minutes: number;
  order_index: number;
}

export interface TestMeetingItem {
  id: string;
  meeting_id: string;
  title: string;
  description: string | null;
  type: 'topic' | 'agenda_item' | 'action_item';
  assigned_to: string | null;
  created_by: string | null;
  is_completed: boolean;
  notes: string | null;
  outcome: string | null;
  time_minutes: number | null;
  order_index: number;
}

/**
 * Create agenda template via API
 */
export async function createAgendaTemplate(
  userId: string,
  name: string,
  description?: string
): Promise<TestAgendaTemplate> {
  const { data, error } = await supabase
    .from('agenda_templates')
    .insert({
      user_id: userId,
      name,
      description: description || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Add item to agenda template
 */
export async function addTemplateItem(
  templateId: string,
  title: string,
  durationMinutes: number,
  orderIndex: number
): Promise<TestAgendaTemplateItem> {
  const { data, error } = await supabase
    .from('agenda_template_items')
    .insert({
      template_id: templateId,
      title,
      duration_minutes: durationMinutes,
      order_index: orderIndex,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get agenda template with items
 */
export async function getAgendaTemplate(templateId: string): Promise<any> {
  const { data, error } = await supabase
    .from('agenda_templates')
    .select(`
      *,
      items:agenda_template_items(*)
    `)
    .eq('id', templateId)
    .single();

  if (error) return null;
  
  // Sort items by order_index
  if (data && data.items) {
    data.items.sort((a: any, b: any) => a.order_index - b.order_index);
  }
  
  return data;
}

/**
 * Get user's agenda templates
 */
export async function getUserAgendaTemplates(userId: string): Promise<TestAgendaTemplate[]> {
  const { data, error } = await supabase
    .from('agenda_templates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Update agenda template
 */
export async function updateAgendaTemplate(
  templateId: string,
  updates: Partial<TestAgendaTemplate>
): Promise<void> {
  const { error } = await supabase
    .from('agenda_templates')
    .update(updates)
    .eq('id', templateId);

  if (error) throw error;
}

/**
 * Delete agenda template
 */
export async function deleteAgendaTemplate(templateId: string): Promise<void> {
  try {
    // Delete items first
    await supabase
      .from('agenda_template_items')
      .delete()
      .eq('template_id', templateId);

    // Delete template
    await supabase
      .from('agenda_templates')
      .delete()
      .eq('id', templateId);
  } catch (error) {
    console.warn(`Failed to delete template ${templateId}:`, error);
  }
}

/**
 * Reorder template items
 */
export async function reorderTemplateItems(
  items: Array<{ id: string; order_index: number }>
): Promise<void> {
  for (const item of items) {
    await supabase
      .from('agenda_template_items')
      .update({ order_index: item.order_index })
      .eq('id', item.id);
  }
}

/**
 * Create meeting item (topic)
 */
export async function createMeetingItem(
  meetingId: string,
  title: string,
  type: 'topic' | 'agenda_item' | 'action_item',
  createdBy: string,
  orderIndex: number,
  options?: {
    description?: string;
    assignedTo?: string;
    timeMinutes?: number;
  }
): Promise<TestMeetingItem> {
  const { data, error } = await supabase
    .from('meeting_items')
    .insert({
      meeting_id: meetingId,
      title,
      type,
      created_by: createdBy,
      order_index: orderIndex,
      description: options?.description || null,
      assigned_to: options?.assignedTo || null,
      time_minutes: options?.timeMinutes || null,
      is_completed: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get meeting items
 */
export async function getMeetingItems(meetingId: string): Promise<TestMeetingItem[]> {
  const { data, error } = await supabase
    .from('meeting_items')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('order_index', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Update meeting item
 */
export async function updateMeetingItem(
  itemId: string,
  updates: Partial<TestMeetingItem>
): Promise<void> {
  const { error } = await supabase
    .from('meeting_items')
    .update(updates)
    .eq('id', itemId);

  if (error) throw error;
}

/**
 * Delete meeting item
 */
export async function deleteMeetingItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('meeting_items')
    .delete()
    .eq('id', itemId);

  if (error) throw error;
}

/**
 * Navigate to settings/templates page
 */
export async function navigateToTemplates(page: Page): Promise<void> {
  await page.goto('/settings');
  
  // Look for agenda templates section
  const templatesSection = page.getByText(/agenda.*templates/i);
  if (await templatesSection.isVisible().catch(() => false)) {
    await templatesSection.click();
  }
}

/**
 * Navigate to meeting instance
 */
export async function navigateToMeeting(
  page: Page,
  teamId: string,
  meetingId: string
): Promise<void> {
  await page.goto(`/team/${teamId}/meeting/${meetingId}`);
}

