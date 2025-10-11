import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser, loginViaUI } from '../helpers/auth.helper';
import { createTeam, deleteTeam } from '../helpers/team.helper';
import { 
  createRecurringMeeting, 
  deleteRecurringMeeting, 
  getRecurringMeeting,
  updateRecurringMeeting,
  getTeamRecurringMeetings,
  getWeeklyMeetings,
  createWeeklyMeeting
} from '../helpers/meeting.helper';

/**
 * Test 4.4: Edit series meta
 * - Changing name/type updates future display
 * - Changing cadence only affects future instances; past untouched
 * - Confirm UX warns about scope of changes
 */
test.describe('Meeting Series - Edit Series', () => {
  let adminEmail: string;
  let adminUserId: string;
  let teamId: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async ({ page }) => {
    adminEmail = generateTestEmail('edit-series-admin');
    const admin = await createVerifiedUser(adminEmail, testPassword);
    adminUserId = admin.id!;
    
    const team = await createTeam(adminUserId, 'Edit Series Team');
    teamId = team.id;
    
    await loginViaUI(page, adminEmail, testPassword);
  });

  test.afterEach(async () => {
    const series = await getTeamRecurringMeetings(teamId);
    for (const s of series) {
      await deleteRecurringMeeting(s.id);
    }
    if (teamId) await deleteTeam(teamId);
    if (adminUserId) await deleteUser(adminUserId);
  });

  test('should update series name', async () => {
    // Create series
    const series = await createRecurringMeeting(
      teamId,
      'Original Name',
      'weekly',
      adminUserId
    );

    // Update name
    const newName = 'Updated Series Name';
    await updateRecurringMeeting(series.id, { name: newName });

    // Verify update
    const updated = await getRecurringMeeting(series.id);
    expect(updated?.name).toBe(newName);

    await deleteRecurringMeeting(series.id);
  });

  test('should update series frequency', async () => {
    // Create weekly series
    const series = await createRecurringMeeting(
      teamId,
      'Frequency Change Test',
      'weekly',
      adminUserId
    );

    // Update to biweekly
    await updateRecurringMeeting(series.id, { frequency: 'biweekly' });

    // Verify update
    const updated = await getRecurringMeeting(series.id);
    expect(updated?.frequency).toBe('biweekly');

    await deleteRecurringMeeting(series.id);
  });

  test.skip('should show warning when changing frequency', async ({ page }) => {
    // Create series with some instances
    const series = await createRecurringMeeting(
      teamId,
      'Warning Test',
      'weekly',
      adminUserId
    );

    // Create some past instances
    await createWeeklyMeeting(teamId, series.id, '2025-01-01');
    await createWeeklyMeeting(teamId, series.id, '2025-01-08');

    // Navigate to series settings
    await page.goto(`/team/${teamId}/meeting/${series.id}/settings`);

    // Try to change frequency
    const frequencySelect = page.getByLabel(/frequency|cadence/i);
    if (await frequencySelect.isVisible().catch(() => false)) {
      await frequencySelect.selectOption('monthly');

      // Should show warning about affecting future instances
      await expect(page.getByText(/future.*instances|past.*unchanged/i)).toBeVisible();
    }

    await deleteRecurringMeeting(series.id);
  });

  test.skip('changing frequency should only affect future instances', async () => {
    // Create series
    const series = await createRecurringMeeting(
      teamId,
      'Future Only Test',
      'weekly',
      adminUserId
    );

    // Create past instances
    const past1 = await createWeeklyMeeting(teamId, series.id, '2025-01-01');
    const past2 = await createWeeklyMeeting(teamId, series.id, '2025-01-08');

    // Change frequency
    await updateRecurringMeeting(series.id, { frequency: 'biweekly' });

    // Verify past instances still exist and unchanged
    const instances = await getWeeklyMeetings(series.id);
    expect(instances.length).toBeGreaterThanOrEqual(2);

    // New instances created after this point should follow biweekly pattern
    // (Implementation would depend on instance creation logic)

    await deleteRecurringMeeting(series.id);
  });

  test('should persist all edits', async ({ page }) => {
    // Create series
    const series = await createRecurringMeeting(
      teamId,
      'Multi-edit Test',
      'weekly',
      adminUserId
    );

    // Make multiple updates
    await updateRecurringMeeting(series.id, {
      name: 'Final Name',
      frequency: 'monthly'
    });

    // Verify all changes persisted
    const updated = await getRecurringMeeting(series.id);
    expect(updated?.name).toBe('Final Name');
    expect(updated?.frequency).toBe('monthly');

    await deleteRecurringMeeting(series.id);
  });

  test.skip('should show edit history/audit trail', async ({ page }) => {
    // If your system tracks changes:
    // - Who made the change
    // - When it was changed
    // - What was changed (before/after)
    
    // Expected display:
    // "Changed name from 'Weekly Tactical' to 'Tactical Sync' by John Doe on Jan 1, 2025"
    // "Changed frequency from weekly to biweekly by Jane Smith on Jan 15, 2025"
  });
});

/**
 * Test 4.5: Archive/cancel series
 * - Past instances remain read-only
 * - Future instance creation disabled
 */
test.describe('Meeting Series - Archive/Cancel Series', () => {
  let adminEmail: string;
  let adminUserId: string;
  let teamId: string;
  const testPassword = 'Test123456!';

  test.beforeEach(async ({ page }) => {
    adminEmail = generateTestEmail('archive-series-admin');
    const admin = await createVerifiedUser(adminEmail, testPassword);
    adminUserId = admin.id!;
    
    const team = await createTeam(adminUserId, 'Archive Series Team');
    teamId = team.id;
    
    await loginViaUI(page, adminEmail, testPassword);
  });

  test.afterEach(async () => {
    const series = await getTeamRecurringMeetings(teamId);
    for (const s of series) {
      await deleteRecurringMeeting(s.id);
    }
    if (teamId) await deleteTeam(teamId);
    if (adminUserId) await deleteUser(adminUserId);
  });

  test('should delete series', async () => {
    // Create series
    const series = await createRecurringMeeting(
      teamId,
      'To Be Deleted',
      'weekly',
      adminUserId
    );

    const seriesId = series.id;

    // Delete series
    await deleteRecurringMeeting(seriesId);

    // Verify deleted
    const deleted = await getRecurringMeeting(seriesId);
    expect(deleted).toBeNull();
  });

  test.skip('should archive series instead of deleting', async ({ page }) => {
    // If your system supports archiving (soft delete):
    
    // Create series with instances
    const series = await createRecurringMeeting(
      teamId,
      'To Archive',
      'weekly',
      adminUserId
    );

    await createWeeklyMeeting(teamId, series.id, '2025-01-01');
    await createWeeklyMeeting(teamId, series.id, '2025-01-08');

    // Navigate to settings
    await page.goto(`/team/${teamId}/meeting/${series.id}/settings`);

    // Find archive button
    const archiveButton = page.getByRole('button', { name: /archive|deactivate/i });
    if (await archiveButton.isVisible().catch(() => false)) {
      await archiveButton.click();

      // Confirm if needed
      const confirmButton = page.getByRole('button', { name: /confirm|yes/i });
      if (await confirmButton.isVisible().catch(() => false)) {
        await confirmButton.click();
      }

      // Should show success message
      await expect(page.getByText(/archived|deactivated/i)).toBeVisible({ timeout: 10000 });

      // Verify series is archived (has archived flag or status)
      const archived = await getRecurringMeeting(series.id);
      // Check for archived status if implemented:
      // expect(archived?.status).toBe('archived');
    }

    await deleteRecurringMeeting(series.id);
  });

  test.skip('archived series should preserve past instances', async () => {
    // Create series with past instances
    const series = await createRecurringMeeting(
      teamId,
      'Archive with History',
      'weekly',
      adminUserId
    );

    await createWeeklyMeeting(teamId, series.id, '2025-01-01');
    await createWeeklyMeeting(teamId, series.id, '2025-01-08');

    // Archive series
    // (Assuming an archive status or flag)

    // Verify past instances still accessible
    const instances = await getWeeklyMeetings(series.id);
    expect(instances.length).toBe(2);

    // Past instances should be read-only
    // (Implementation detail - would check permissions or flags)

    await deleteRecurringMeeting(series.id);
  });

  test.skip('archived series should prevent new instance creation', async ({ page }) => {
    // Create and archive series
    const series = await createRecurringMeeting(
      teamId,
      'No More Instances',
      'weekly',
      adminUserId
    );

    // Archive it
    // (Implementation specific)

    // Try to create new instance
    await page.goto(`/team/${teamId}/meeting/${series.id}`);

    // "Create Next Meeting" button should be disabled or hidden
    const createButton = page.getByRole('button', { name: /create.*next|new.*meeting/i });
    
    if (await createButton.isVisible().catch(() => false)) {
      await expect(createButton).toBeDisabled();
    } else {
      // Button is hidden - also valid behavior
      expect(await createButton.isVisible().catch(() => false)).toBe(false);
    }

    await deleteRecurringMeeting(series.id);
  });

  test.skip('should require confirmation before deleting series with meetings', async ({ page }) => {
    // Create series with instances
    const series = await createRecurringMeeting(
      teamId,
      'Delete Confirmation Test',
      'weekly',
      adminUserId
    );

    await createWeeklyMeeting(teamId, series.id, '2025-01-01');
    await createWeeklyMeeting(teamId, series.id, '2025-01-08');

    await page.goto(`/team/${teamId}/meeting/${series.id}/settings`);

    // Find delete button
    const deleteButton = page.getByRole('button', { name: /delete/i });
    await deleteButton.click();

    // Should show warning about existing meetings
    await expect(page.getByText(/existing meetings|will be deleted|permanently delete/i))
      .toBeVisible();

    // Should require confirmation (typing name, clicking confirm, etc.)
    const confirmInput = page.getByPlaceholder(/type.*name/i);
    if (await confirmInput.isVisible().catch(() => false)) {
      await confirmInput.fill('Delete Confirmation Test');
      await page.getByRole('button', { name: /confirm|delete/i }).click();
    }

    await deleteRecurringMeeting(series.id);
  });

  test.skip('should restore archived series', async ({ page }) => {
    // If restore functionality is supported:
    
    // Create and archive series
    const series = await createRecurringMeeting(
      teamId,
      'To Restore',
      'weekly',
      adminUserId
    );

    // Archive it
    // (Implementation specific)

    // Navigate to archived series list
    await page.goto(`/team/${teamId}/meetings/archived`);

    // Find restore button
    const restoreButton = page.getByRole('button', { name: /restore|reactivate/i }).first();
    if (await restoreButton.isVisible().catch(() => false)) {
      await restoreButton.click();

      // Should move back to active series
      await expect(page.getByText(/restored|reactivated/i)).toBeVisible({ timeout: 10000 });

      // Verify series is active again
      const restored = await getRecurringMeeting(series.id);
      // Check status:
      // expect(restored?.status).toBe('active');
    }

    await deleteRecurringMeeting(series.id);
  });
});

