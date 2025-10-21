import { supabase } from './supabase.helper';

export interface MeetingItem {
  id: string;
  title: string;
  description?: string;
  time_minutes?: number;
  order_index: number;
  created_by: string;
  assigned_to?: string;
  completion_status: 'completed' | 'not_completed';
}

export interface AgendaTemplate {
  id: string;
  name: string;
  created_by: string;
  items: AgendaTemplateItem[];
}

export interface AgendaTemplateItem {
  id: string;
  template_id: string;
  title: string;
  time_minutes: number;
  order_index: number;
}

export async function createAgendaTemplate(
  userId: string,
  name: string
): Promise<AgendaTemplate> {
  const { data, error } = await supabase
    .from('agenda_templates')
    .insert({
      name,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return { ...data, items: [] };
}

export async function addTemplateItem(
  templateId: string,
  title: string,
  timeMinutes: number,
  orderIndex: number
): Promise<AgendaTemplateItem> {
  const { data, error } = await supabase
    .from('agenda_template_items')
    .insert({
      template_id: templateId,
      title,
      time_minutes: timeMinutes,
      order_index: orderIndex,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAgendaTemplate(templateId: string): Promise<AgendaTemplate> {
  const { data: template, error: templateError } = await supabase
    .from('agenda_templates')
    .select()
    .eq('id', templateId)
    .single();

  if (templateError) throw templateError;

  const { data: items, error: itemsError } = await supabase
    .from('agenda_template_items')
    .select()
    .eq('template_id', templateId)
    .order('order_index');

  if (itemsError) throw itemsError;

  return { ...template, items };
}

export async function deleteAgendaTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from('agenda_templates')
    .delete()
    .eq('id', templateId);

  if (error) throw error;
}

export async function getUserAgendaTemplates(userId: string): Promise<AgendaTemplate[]> {
  const { data: templates, error: templatesError } = await supabase
    .from('agenda_templates')
    .select()
    .eq('created_by', userId);

  if (templatesError) throw templatesError;

  const result: AgendaTemplate[] = [];
  for (const template of templates) {
    const { data: items, error: itemsError } = await supabase
      .from('agenda_template_items')
      .select()
      .eq('template_id', template.id)
      .order('order_index');

    if (itemsError) throw itemsError;
    result.push({ ...template, items });
  }

  return result;
}

export async function reorderTemplateItems(
  updates: { id: string; order_index: number }[]
): Promise<void> {
  for (const update of updates) {
    const { error } = await supabase
      .from('agenda_template_items')
      .update({ order_index: update.order_index })
      .eq('id', update.id);

    if (error) throw error;
  }
}

export async function updateAgendaTemplate(
  templateId: string,
  updates: { name?: string }
): Promise<void> {
  const { error } = await supabase
    .from('agenda_templates')
    .update(updates)
    .eq('id', templateId);

  if (error) throw error;
}

export async function createMeetingItem(
  instanceId: string,
  title: string,
  type: 'agenda' | 'priority' | 'topic' | 'action_item',
  createdBy: string,
  orderIndex: number,
  options: {
    description?: string;
    timeMinutes?: number;
    assignedTo?: string;
  } = {}
): Promise<MeetingItem> {
  const table = type === 'agenda' ? 'meeting_series_agenda' :
                type === 'priority' ? 'meeting_instance_priorities' :
                type === 'topic' ? 'meeting_instance_topics' :
                'meeting_series_action_items';

  const { data, error } = await supabase
    .from(table)
    .insert({
      instance_id: instanceId,
      title,
      description: options.description,
      time_minutes: options.timeMinutes,
      assigned_to: options.assignedTo,
      order_index: orderIndex,
      created_by: createdBy,
      completion_status: 'not_completed',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMeetingItem(
  itemId: string,
  updates: {
    title?: string;
    description?: string;
    timeMinutes?: number;
    assignedTo?: string;
    completionStatus?: 'completed' | 'not_completed';
  }
): Promise<void> {
  const { error } = await supabase
    .from('meeting_instance_topics')
    .update({
      title: updates.title,
      description: updates.description,
      time_minutes: updates.timeMinutes,
      assigned_to: updates.assignedTo,
      completion_status: updates.completionStatus,
    })
    .eq('id', itemId);

  if (error) throw error;
}

export async function deleteMeetingItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('meeting_instance_topics')
    .delete()
    .eq('id', itemId);

  if (error) throw error;
}

export async function getMeetingItems(instanceId: string): Promise<MeetingItem[]> {
  const { data, error } = await supabase
    .from('meeting_instance_topics')
    .select()
    .eq('instance_id', instanceId)
    .order('order_index');

  if (error) throw error;
  return data;
}
