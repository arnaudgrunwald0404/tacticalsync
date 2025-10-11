import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser } from '../helpers/auth.helper';
import { createTeam, deleteTeam, addTeamMember } from '../helpers/team.helper';
import { createRecurringMeeting, deleteRecurringMeeting, createWeeklyMeeting } from '../helpers/meeting.helper';
import { createMeetingItem, updateMeetingItem, deleteMeetingItem, getMeetingItems } from '../helpers/agenda.helper';

/**
 * Test 6.5: Topics - edit/delete permissions
 * - Author can edit/delete own topic until instance is "locked"
 * - Admin can edit/delete any topic
 * - Audit records retain before/after
 */
test.describe('Meeting Instances - Edit/Delete Topics', () => {
  let adminUserId: string;
  let memberUserId: string;
  let teamId: string;

  test.beforeEach(async () => {
    // Create admin
    const adminEmail = generateTestEmail('topics-admin');
    const admin = await createVerifiedUser(adminEmail, 'Test123456!');
    adminUserId = admin.id!;
    
    // Create member
    const memberEmail = generateTestEmail('topics-member');
    const member = await createVerifiedUser(memberEmail, 'Test123456!');
    memberUserId = member.id!;
    
    // Create team
    const team = await createTeam(adminUserId, 'Edit Topics Team');
    teamId = team.id;
    
    // Add member to team
    await addTeamMember(teamId, memberUserId, 'member');
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (adminUserId) await deleteUser(adminUserId);
    if (memberUserId) await deleteUser(memberUserId);
  });

  test('author should edit own topic', async () => {
    const series = await createRecurringMeeting(teamId, 'Meeting', 'weekly', adminUserId);
    const instance = await createWeeklyMeeting(teamId, series.id, '2025-01-06');
    
    try {
      // Member creates topic
      const topic = await createMeetingItem(
        instance.id,
        'Original Title',
        'topic',
        memberUserId,
        0
      );
      
      // Member updates own topic
      await updateMeetingItem(topic.id, {
        title: 'Updated Title',
        description: 'Added description'
      });
      
      const topics = await getMeetingItems(instance.id);
      expect(topics[0].title).toBe('Updated Title');
      expect(topics[0].description).toBe('Added description');
      
    } finally {
      await deleteRecurringMeeting(series.id);
    }
  });

  test('author should delete own topic', async () => {
    const series = await createRecurringMeeting(teamId, 'Meeting', 'weekly', adminUserId);
    const instance = await createWeeklyMeeting(teamId, series.id, '2025-01-06');
    
    try {
      // Create topic
      const topic = await createMeetingItem(
        instance.id,
        'To Delete',
        'topic',
        memberUserId,
        0
      );
      
      // Delete topic
      await deleteMeetingItem(topic.id);
      
      const topics = await getMeetingItems(instance.id);
      expect(topics.length).toBe(0);
      
    } finally {
      await deleteRecurringMeeting(series.id);
    }
  });

  test.skip('admin should edit any topic', async () => {
    // Expected behavior:
    // - Member creates topic
    // - Admin edits that topic
    // - Edit succeeds
    // - Audit log records: "Edited by Admin (originally by Member)"
  });

  test.skip('admin should delete any topic', async () => {
    // Expected behavior:
    // - Member creates topic
    // - Admin deletes that topic
    // - Deletion succeeds
    // - Audit log records deletion
  });

  test.skip('non-author member cannot edit others topics', async () => {
    // Expected behavior:
    // - Member A creates topic
    // - Member B tries to edit it
    // - Permission denied
    // - Only admin or author can edit
  });
});

/**
 * Test 6.6: Topic limits & content safety
 * - Length limits, attachment limits (if any)
 * - Reject HTML/JS injection (XSS) and sanitize display
 */
test.describe('Meeting Instances - Topic Limits and Safety', () => {
  let userId: string;
  let teamId: string;

  test.beforeEach(async () => {
    const userEmail = generateTestEmail('topics-safety');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    userId = user.id!;
    
    const team = await createTeam(userId, 'Safety Test Team');
    teamId = team.id;
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (userId) await deleteUser(userId);
  });

  test('should accept reasonable topic length', async () => {
    const series = await createRecurringMeeting(teamId, 'Meeting', 'weekly', userId);
    const instance = await createWeeklyMeeting(teamId, series.id, '2025-01-06');
    
    try {
      const longTitle = 'This is a reasonably long topic title that should be accepted';
      const longDescription = 'This is a longer description that provides context. '.repeat(10);
      
      const topic = await createMeetingItem(
        instance.id,
        longTitle,
        'topic',
        userId,
        0,
        { description: longDescription }
      );
      
      expect(topic.title).toBe(longTitle);
      expect(topic.description?.length).toBeGreaterThan(100);
      
    } finally {
      await deleteRecurringMeeting(series.id);
    }
  });

  test.skip('should sanitize HTML in topic content', async () => {
    // Security test: Prevent XSS attacks
    
    const dangerousTitle = '<script>alert("XSS")</script>Safe Title';
    const dangerousDescription = '<img src=x onerror="alert(1)">';
    
    // Expected behavior:
    // - HTML tags are stripped or escaped
    // - Script execution prevented
    // - Content displayed safely
    // - Title shown as: "Safe Title" (script removed)
  });

  test.skip('should reject extremely long content', async () => {
    // Expected behavior:
    // - Title > 500 chars rejected
    // - Description > 10,000 chars rejected
    // - Error message shown to user
  });

  test.skip('should limit number of topics per meeting', async () => {
    // If there's a limit (e.g., 50 topics per meeting)
    
    // Expected behavior:
    // - User tries to add 51st topic
    // - Error: "Maximum topics reached"
    // - Suggest removing old topics or creating new meeting
  });
});

/**
 * Test 6.7: Topics do not carry over
 * 
 * Given instance #N with topics
 * When instance #N+1 is created
 * Then topics list is empty (by design)
 */
test.describe('Meeting Instances - Topics Do Not Carry Over', () => {
  let userId: string;
  let teamId: string;

  test.beforeEach(async () => {
    const userEmail = generateTestEmail('no-carryover');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    userId = user.id!;
    
    const team = await createTeam(userId, 'Carryover Test Team');
    teamId = team.id;
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (userId) await deleteUser(userId);
  });

  test('topics should NOT carry over to next instance', async () => {
    const series = await createRecurringMeeting(teamId, 'Meeting', 'weekly', userId);
    
    try {
      // Create instance 1 with topics
      const instance1 = await createWeeklyMeeting(teamId, series.id, '2025-01-06');
      await createMeetingItem(instance1.id, 'Week 1 Topic 1', 'topic', userId, 0);
      await createMeetingItem(instance1.id, 'Week 1 Topic 2', 'topic', userId, 1);
      await createMeetingItem(instance1.id, 'Week 1 Topic 3', 'topic', userId, 2);
      
      // Verify instance 1 has 3 topics
      const instance1Topics = await getMeetingItems(instance1.id);
      expect(instance1Topics.length).toBe(3);
      
      // Create instance 2
      const instance2 = await createWeeklyMeeting(teamId, series.id, '2025-01-13');
      
      // Instance 2 should have ZERO topics
      const instance2Topics = await getMeetingItems(instance2.id);
      expect(instance2Topics.length).toBe(0);
      
      // Instance 1 should still have its topics
      const instance1TopicsCheck = await getMeetingItems(instance1.id);
      expect(instance1TopicsCheck.length).toBe(3);
      
      // Add topics to instance 2
      await createMeetingItem(instance2.id, 'Week 2 Topic 1', 'topic', userId, 0);
      
      // Instance 2 now has 1 topic
      const instance2Updated = await getMeetingItems(instance2.id);
      expect(instance2Updated.length).toBe(1);
      
      // Instance 1 still has 3 topics (unchanged)
      const instance1Final = await getMeetingItems(instance1.id);
      expect(instance1Final.length).toBe(3);
      
    } finally {
      await deleteRecurringMeeting(series.id);
    }
  });
});

/**
 * Test 6.8: Locking past instances
 * 
 * When instance is marked "completed/locked"
 * Then agenda structure & topics are read-only; comments/notes rules (if any) enforced
 */
test.describe('Meeting Instances - Locking Past Instances', () => {
  
  test.skip('should lock completed meeting instances', async () => {
    // This test requires a "status" or "is_locked" field on meeting instances
    
    // Expected behavior:
    // - Meeting is marked as "completed"
    // - Topics become read-only
    // - Cannot add new topics
    // - Cannot edit existing topics
    // - Cannot delete topics
    // - Agenda structure is read-only
    // - Historical data is preserved
  });

  test.skip('locked instance should prevent topic edits', async () => {
    // Expected behavior:
    // - Meeting is locked
    // - User tries to edit topic
    // - Error: "This meeting is locked. Topics cannot be edited."
    // - Edit button disabled or hidden
  });

  test.skip('locked instance should prevent topic additions', async () => {
    // Expected behavior:
    // - Meeting is locked
    // - "Add Topic" button disabled or hidden
    // - If user tries via API, rejected with error
  });

  test.skip('should allow comments on locked instances', async () => {
    // Even if topics are locked, might allow comments/notes
    
    // Expected behavior:
    // - Meeting is locked
    // - Topics read-only
    // - Can still add comments/notes
    // - Useful for retrospective or follow-up discussions
  });
});

