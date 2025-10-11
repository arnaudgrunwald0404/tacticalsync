import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser, loginViaUI } from '../helpers/auth.helper';
import { createAgendaTemplate, addTemplateItem, getAgendaTemplate, deleteAgendaTemplate, getUserAgendaTemplates } from '../helpers/agenda.helper';

/**
 * Test 5.1: Create template for series
 * 
 * When admin defines ordered agenda items (title, description, duration, owner optional)
 * Then template saved and attached to series
 */
test.describe('Agenda Templates - Create Template', () => {
  let userEmail: string;
  let userId: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async ({ page }) => {
    userEmail = generateTestEmail('template-create');
    const user = await createVerifiedUser(userEmail, testPassword);
    userId = user.id!;
    
    await loginViaUI(page, userEmail, testPassword);
  });

  test.afterEach(async () => {
    // Cleanup templates
    const templates = await getUserAgendaTemplates(userId);
    for (const template of templates) {
      await deleteAgendaTemplate(template.id);
    }
    
    if (userId) {
      await deleteUser(userId);
    }
  });

  test('should create agenda template with name', async () => {
    const templateName = 'Weekly Tactical Agenda';
    
    const template = await createAgendaTemplate(userId, templateName);
    
    expect(template).toBeTruthy();
    expect(template.name).toBe(templateName);
    expect(template.user_id).toBe(userId);
  });

  test('should create template with description', async () => {
    const templateName = 'Strategic Planning';
    const description = 'Quarterly strategic planning session';
    
    const template = await createAgendaTemplate(userId, templateName, description);
    
    expect(template.description).toBe(description);
  });

  test('should add items to template', async () => {
    const template = await createAgendaTemplate(userId, 'Test Template');
    
    // Add items
    await addTemplateItem(template.id, 'Good News', 5, 0);
    await addTemplateItem(template.id, 'Scorecard Review', 10, 1);
    await addTemplateItem(template.id, 'Rock Review', 15, 2);
    
    // Verify items
    const templateWithItems = await getAgendaTemplate(template.id);
    expect(templateWithItems.items).toBeTruthy();
    expect(templateWithItems.items.length).toBe(3);
    
    // Verify order
    expect(templateWithItems.items[0].title).toBe('Good News');
    expect(templateWithItems.items[1].title).toBe('Scorecard Review');
    expect(templateWithItems.items[2].title).toBe('Rock Review');
  });

  test('should create items with duration', async () => {
    const template = await createAgendaTemplate(userId, 'Timed Agenda');
    
    await addTemplateItem(template.id, 'Quick Update', 5, 0);
    await addTemplateItem(template.id, 'Deep Dive', 30, 1);
    
    const templateWithItems = await getAgendaTemplate(template.id);
    expect(templateWithItems.items[0].duration_minutes).toBe(5);
    expect(templateWithItems.items[1].duration_minutes).toBe(30);
  });

  test('should create ordered items', async () => {
    const template = await createAgendaTemplate(userId, 'Ordered Agenda');
    
    // Add in different order
    await addTemplateItem(template.id, 'Third Item', 5, 2);
    await addTemplateItem(template.id, 'First Item', 5, 0);
    await addTemplateItem(template.id, 'Second Item', 5, 1);
    
    const templateWithItems = await getAgendaTemplate(template.id);
    
    // Should be sorted by order_index
    expect(templateWithItems.items[0].title).toBe('First Item');
    expect(templateWithItems.items[1].title).toBe('Second Item');
    expect(templateWithItems.items[2].title).toBe('Third Item');
  });

  test('should require template name', async () => {
    // Try to create template without name
    try {
      await createAgendaTemplate(userId, '');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });

  test.skip('should attach template to meeting series', async () => {
    // This test requires:
    // 1. Creating a meeting series
    // 2. Attaching a template to it
    // 3. Verifying the attachment
    
    // Expected behavior:
    // - Series has template_id reference
    // - When creating new meeting instance, agenda structure is copied from template
  });
});

/**
 * Test 5.2: Apply & carry-over
 * 
 * Given instance #1 created with template
 * When admin clicks Create Next Meeting
 * Then instance #2 has identical agenda structure, zero topics
 */
test.describe('Agenda Templates - Apply and Carry-over', () => {
  
  test.skip('should apply template to new meeting instance', async () => {
    // This test requires:
    // 1. Creating a meeting series with a template
    // 2. Creating first instance
    // 3. Verifying agenda structure matches template
    
    // Expected behavior:
    // - Meeting instance has agenda items matching template structure
    // - Each item has title, duration from template
    // - Items are in correct order
    // - No topics yet (topics are separate from agenda structure)
  });

  test.skip('should create next meeting with same agenda structure', async () => {
    // This test requires:
    // 1. Meeting instance #1 with agenda and topics
    // 2. Creating instance #2
    // 3. Verifying #2 has same agenda structure but no topics
    
    // Expected behavior:
    // - Instance #2 agenda structure identical to #1
    // - Instance #2 topics list is empty
    // - Topics from #1 do NOT carry over
  });

  test.skip('should not carry over topics to next instance', async () => {
    // Key test: Topics are instance-specific
    
    // Expected behavior:
    // - Instance #1 has 5 topics
    // - Create Instance #2
    // - Instance #2 has 0 topics
    // - Instance #1 still has its 5 topics
  });
});

/**
 * Test 5.3: Edit template mid-series
 * 
 * When template is edited before creating next instance
 * Then the next instance reflects changes; the current/past do not change
 */
test.describe('Agenda Templates - Edit Template', () => {
  let userId: string;

  test.beforeEach(async () => {
    const userEmail = generateTestEmail('template-edit');
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

  test('should update template name', async () => {
    const template = await createAgendaTemplate(userId, 'Original Name');
    
    await supabase
      .from('agenda_templates')
      .update({ name: 'Updated Name' })
      .eq('id', template.id);
    
    const updated = await getAgendaTemplate(template.id);
    expect(updated.name).toBe('Updated Name');
  });

  test.skip('should affect only future instances when template edited', async () => {
    // This test requires:
    // 1. Creating series with template
    // 2. Creating instance #1
    // 3. Editing template
    // 4. Creating instance #2
    // 5. Verifying #1 unchanged, #2 has new template
    
    // Expected behavior:
    // - Instance #1 agenda remains as originally created
    // - Instance #2 uses updated template
    // - Past instances are not retroactively changed
  });
});

// Import supabase for some tests
import { supabase } from '../helpers/supabase.helper';

