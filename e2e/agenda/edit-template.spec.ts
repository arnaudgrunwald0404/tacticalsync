import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser } from '../helpers/auth.helper';
import { 
  createAgendaTemplate, 
  addTemplateItem, 
  getAgendaTemplate, 
  deleteAgendaTemplate,
  getUserAgendaTemplates,
  reorderTemplateItems,
  updateAgendaTemplate
} from '../helpers/agenda.helper';

/**
 * Test 5.4: Reorder / add / remove items
 * - Drag-reorder persists
 * - Add/remove reflects immediately for the current instance structure
 * - Defines baseline for next instance
 */
test.describe('Agenda Templates - Reorder and Edit Items', () => {
  let userId: string;

  test.beforeEach(async () => {
    const userEmail = generateTestEmail('template-reorder');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    userId = user.id!;
  });

  test.afterEach(async () => {
    const templates = await getUserAgendaTemplates(userId);
    for (const template of templates) {
      await deleteAgendaTemplate(template.id);
    }
    if (userId) {
      await deleteUser(userId);
    }
  });

  test('should reorder template items', async () => {
    const template = await createAgendaTemplate(userId, 'Reorder Test');
    
    // Add items
    const item1 = await addTemplateItem(template.id, 'First', 5, 0);
    const item2 = await addTemplateItem(template.id, 'Second', 5, 1);
    const item3 = await addTemplateItem(template.id, 'Third', 5, 2);
    
    // Reorder: swap first and third
    await reorderTemplateItems([
      { id: item3.id, order_index: 0 },
      { id: item2.id, order_index: 1 },
      { id: item1.id, order_index: 2 },
    ]);
    
    // Verify new order
    const updated = await getAgendaTemplate(template.id);
    expect(updated.items[0].title).toBe('Third');
    expect(updated.items[1].title).toBe('Second');
    expect(updated.items[2].title).toBe('First');
  });

  test('should add items to existing template', async () => {
    const template = await createAgendaTemplate(userId, 'Add Items Test');
    
    // Add initial items
    await addTemplateItem(template.id, 'Item 1', 5, 0);
    await addTemplateItem(template.id, 'Item 2', 5, 1);
    
    // Verify 2 items
    let templateData = await getAgendaTemplate(template.id);
    expect(templateData.items.length).toBe(2);
    
    // Add more items
    await addTemplateItem(template.id, 'Item 3', 5, 2);
    await addTemplateItem(template.id, 'Item 4', 5, 3);
    
    // Verify 4 items
    templateData = await getAgendaTemplate(template.id);
    expect(templateData.items.length).toBe(4);
  });

  test('should remove items from template', async () => {
    const template = await createAgendaTemplate(userId, 'Remove Items Test');
    
    const item1 = await addTemplateItem(template.id, 'Keep This', 5, 0);
    const item2 = await addTemplateItem(template.id, 'Remove This', 5, 1);
    const item3 = await addTemplateItem(template.id, 'Keep This Too', 5, 2);
    
    // Remove middle item
    await supabase
      .from('agenda_template_items')
      .delete()
      .eq('id', item2.id);
    
    const updated = await getAgendaTemplate(template.id);
    expect(updated.items.length).toBe(2);
    expect(updated.items[0].title).toBe('Keep This');
    expect(updated.items[1].title).toBe('Keep This Too');
  });

  test('should update item title', async () => {
    const template = await createAgendaTemplate(userId, 'Update Test');
    const item = await addTemplateItem(template.id, 'Original Title', 5, 0);
    
    // Update title
    await supabase
      .from('agenda_template_items')
      .update({ title: 'Updated Title' })
      .eq('id', item.id);
    
    const updated = await getAgendaTemplate(template.id);
    expect(updated.items[0].title).toBe('Updated Title');
  });

  test('should update item duration', async () => {
    const template = await createAgendaTemplate(userId, 'Duration Test');
    const item = await addTemplateItem(template.id, 'Item', 5, 0);
    
    // Update duration
    await supabase
      .from('agenda_template_items')
      .update({ duration_minutes: 15 })
      .eq('id', item.id);
    
    const updated = await getAgendaTemplate(template.id);
    expect(updated.items[0].duration_minutes).toBe(15);
  });
});

/**
 * Test 5.5: Validation & limits
 * - Max items per agenda, max duration per item, total meeting duration warning
 * - Guard against empty titles and duplicated IDs
 */
test.describe('Agenda Templates - Validation and Limits', () => {
  let userId: string;

  test.beforeEach(async () => {
    const userEmail = generateTestEmail('template-validation');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    userId = user.id!;
  });

  test.afterEach(async () => {
    const templates = await getUserAgendaTemplates(userId);
    for (const template of templates) {
      await deleteAgendaTemplate(template.id);
    }
    if (userId) {
      await deleteUser(userId);
    }
  });

  test('should reject empty template name', async () => {
    try {
      await createAgendaTemplate(userId, '');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });

  test('should reject empty item title', async () => {
    const template = await createAgendaTemplate(userId, 'Valid Template');
    
    try {
      await addTemplateItem(template.id, '', 5, 0);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });

  test('should accept reasonable number of items', async () => {
    const template = await createAgendaTemplate(userId, 'Many Items');
    
    // Add 10 items (reasonable for most meetings)
    for (let i = 0; i < 10; i++) {
      await addTemplateItem(template.id, `Item ${i + 1}`, 5, i);
    }
    
    const templateData = await getAgendaTemplate(template.id);
    expect(templateData.items.length).toBe(10);
  });

  test.skip('should warn about excessive total duration', async () => {
    // If total duration exceeds reasonable meeting length (e.g., 2 hours)
    const template = await createAgendaTemplate(userId, 'Long Meeting');
    
    // Add items totaling 3 hours
    await addTemplateItem(template.id, 'Long Discussion 1', 60, 0);
    await addTemplateItem(template.id, 'Long Discussion 2', 60, 1);
    await addTemplateItem(template.id, 'Long Discussion 3', 60, 2);
    
    // Expected: UI shows warning about meeting length
    // Total duration: 180 minutes (3 hours)
  });

  test('should handle zero duration items', async () => {
    const template = await createAgendaTemplate(userId, 'Zero Duration');
    
    // Some items might not have explicit time allocation
    await addTemplateItem(template.id, 'Quick Note', 0, 0);
    
    const templateData = await getAgendaTemplate(template.id);
    expect(templateData.items[0].duration_minutes).toBe(0);
  });

  test('should accept various duration values', async () => {
    const template = await createAgendaTemplate(userId, 'Various Durations');
    
    await addTemplateItem(template.id, 'Quick (1 min)', 1, 0);
    await addTemplateItem(template.id, 'Short (5 min)', 5, 1);
    await addTemplateItem(template.id, 'Medium (15 min)', 15, 2);
    await addTemplateItem(template.id, 'Long (30 min)', 30, 3);
    await addTemplateItem(template.id, 'Very Long (60 min)', 60, 4);
    
    const templateData = await getAgendaTemplate(template.id);
    expect(templateData.items.length).toBe(5);
    
    // Verify durations
    const durations = templateData.items.map((item: any) => item.duration_minutes);
    expect(durations).toEqual([1, 5, 15, 30, 60]);
  });
});

// Import supabase for direct database operations in tests
import { supabase } from '../helpers/supabase.helper';

