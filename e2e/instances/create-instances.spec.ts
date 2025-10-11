import { test, expect } from '@playwright/test';
import { generateTestEmail, createVerifiedUser, deleteUser, loginViaUI } from '../helpers/auth.helper';
import { createTeam, deleteTeam } from '../helpers/team.helper';
import { createRecurringMeeting, deleteRecurringMeeting, createWeeklyMeeting, getWeeklyMeetings } from '../helpers/meeting.helper';
import { createMeetingItem, getMeetingItems } from '../helpers/agenda.helper';

/**
 * Test 6.1: Create next meeting (manual action)
 * 
 * Given instance #1 exists
 * When admin clicks Create Next
 * Then instance #2 created with same agenda, topics = empty
 */
test.describe('Meeting Instances - Create Next Meeting', () => {
  let userId: string;
  let teamId: string;

  test.beforeEach(async () => {
    const userEmail = generateTestEmail('instances-create');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    userId = user.id!;
    
    const team = await createTeam(userId, 'Instance Test Team');
    teamId = team.id;
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (userId) await deleteUser(userId);
  });

  test('should create first meeting instance', async () => {
    // Create series
    const series = await createRecurringMeeting(teamId, 'Weekly Meeting', 'weekly', userId);
    
    try {
      // Create first instance
      const instance1 = await createWeeklyMeeting(teamId, series.id, '2025-01-06');
      
      expect(instance1).toBeTruthy();
      expect(instance1.team_id).toBe(teamId);
      expect(instance1.recurring_meeting_id).toBe(series.id);
      expect(instance1.week_start_date).toBe('2025-01-06');
      
    } finally {
      await deleteRecurringMeeting(series.id);
    }
  });

  test('should create multiple instances', async () => {
    const series = await createRecurringMeeting(teamId, 'Weekly Meeting', 'weekly', userId);
    
    try {
      // Create multiple instances
      await createWeeklyMeeting(teamId, series.id, '2025-01-06');
      await createWeeklyMeeting(teamId, series.id, '2025-01-13');
      await createWeeklyMeeting(teamId, series.id, '2025-01-20');
      
      const instances = await getWeeklyMeetings(series.id);
      expect(instances.length).toBe(3);
      
      // Verify dates in order
      expect(instances[0].week_start_date).toBe('2025-01-06');
      expect(instances[1].week_start_date).toBe('2025-01-13');
      expect(instances[2].week_start_date).toBe('2025-01-20');
      
    } finally {
      await deleteRecurringMeeting(series.id);
    }
  });

  test('topics from previous instance do not carry over', async () => {
    const series = await createRecurringMeeting(teamId, 'Weekly Meeting', 'weekly', userId);
    
    try {
      // Create first instance
      const instance1 = await createWeeklyMeeting(teamId, series.id, '2025-01-06');
      
      // Add topics to instance 1
      await createMeetingItem(instance1.id, 'Topic 1', 'topic', userId, 0);
      await createMeetingItem(instance1.id, 'Topic 2', 'topic', userId, 1);
      await createMeetingItem(instance1.id, 'Topic 3', 'topic', userId, 2);
      
      // Verify instance 1 has 3 topics
      const instance1Topics = await getMeetingItems(instance1.id);
      expect(instance1Topics.length).toBe(3);
      
      // Create second instance
      const instance2 = await createWeeklyMeeting(teamId, series.id, '2025-01-13');
      
      // Verify instance 2 has NO topics (they don't carry over)
      const instance2Topics = await getMeetingItems(instance2.id);
      expect(instance2Topics.length).toBe(0);
      
      // Verify instance 1 still has its topics
      const instance1TopicsAgain = await getMeetingItems(instance1.id);
      expect(instance1TopicsAgain.length).toBe(3);
      
    } finally {
      await deleteRecurringMeeting(series.id);
    }
  });
});

/**
 * Test 6.2: Navigate between instances
 * - Prev/Next controls move correctly
 * - Breadcrumb or dropdown allows jumping to any instance
 * - Deep link /series/:id/instance/:n works and enforces access
 */
test.describe('Meeting Instances - Navigation', () => {
  
  test.skip('should navigate between instances with prev/next', async ({ page }) => {
    // This test requires UI implementation
    // Expected behavior:
    // - User on instance #2
    // - Clicks "Previous" → goes to instance #1
    // - Clicks "Next" → goes to instance #3
    // - On first instance, "Previous" is disabled
    // - On last instance, "Next" is disabled or shows "Create Next"
  });

  test.skip('should provide dropdown to jump to any instance', async ({ page }) => {
    // Expected behavior:
    // - Dropdown shows list of all instances
    // - Shows dates or instance numbers
    // - Clicking an instance navigates to it
    // - Current instance is highlighted
  });

  test.skip('should support deep links to specific instances', async ({ page }) => {
    // Expected behavior:
    // - URL: /team/:teamId/meeting/:meetingId
    // - Direct navigation works
    // - Access control enforced (team members only)
    // - Invalid meeting ID shows 404
  });
});

/**
 * Test 6.3: Topics - add before meeting
 * 
 * Given member of team
 * When they add a topic to current instance
 * Then topic is visible with author, timestamp, and optional labels
 */
test.describe('Meeting Instances - Add Topics Before Meeting', () => {
  let userId: string;
  let teamId: string;

  test.beforeEach(async () => {
    const userEmail = generateTestEmail('topics-before');
    const user = await createVerifiedUser(userEmail, 'Test123456!');
    userId = user.id!;
    
    const team = await createTeam(userId, 'Topics Test Team');
    teamId = team.id;
  });

  test.afterEach(async () => {
    if (teamId) await deleteTeam(teamId);
    if (userId) await deleteUser(userId);
  });

  test('should add topic to meeting instance', async () => {
    const series = await createRecurringMeeting(teamId, 'Meeting', 'weekly', userId);
    const instance = await createWeeklyMeeting(teamId, series.id, '2025-01-06');
    
    try {
      // Add topic
      const topic = await createMeetingItem(
        instance.id,
        'Discuss Q1 Budget',
        'topic',
        userId,
        0
      );
      
      expect(topic).toBeTruthy();
      expect(topic.title).toBe('Discuss Q1 Budget');
      expect(topic.type).toBe('topic');
      expect(topic.created_by).toBe(userId);
      expect(topic.meeting_id).toBe(instance.id);
      
    } finally {
      await deleteRecurringMeeting(series.id);
    }
  });

  test('should add topic with description', async () => {
    const series = await createRecurringMeeting(teamId, 'Meeting', 'weekly', userId);
    const instance = await createWeeklyMeeting(teamId, series.id, '2025-01-06');
    
    try {
      const topic = await createMeetingItem(
        instance.id,
        'Hiring Update',
        'topic',
        userId,
        0,
        { description: 'Review open positions and interview pipeline' }
      );
      
      expect(topic.description).toBe('Review open positions and interview pipeline');
      
    } finally {
      await deleteRecurringMeeting(series.id);
    }
  });

  test('should add multiple topics in order', async () => {
    const series = await createRecurringMeeting(teamId, 'Meeting', 'weekly', userId);
    const instance = await createWeeklyMeeting(teamId, series.id, '2025-01-06');
    
    try {
      // Add multiple topics
      await createMeetingItem(instance.id, 'Topic 1', 'topic', userId, 0);
      await createMeetingItem(instance.id, 'Topic 2', 'topic', userId, 1);
      await createMeetingItem(instance.id, 'Topic 3', 'topic', userId, 2);
      
      const topics = await getMeetingItems(instance.id);
      expect(topics.length).toBe(3);
      
      // Verify order
      expect(topics[0].title).toBe('Topic 1');
      expect(topics[1].title).toBe('Topic 2');
      expect(topics[2].title).toBe('Topic 3');
      
    } finally {
      await deleteRecurringMeeting(series.id);
    }
  });

  test('should track topic author', async () => {
    const series = await createRecurringMeeting(teamId, 'Meeting', 'weekly', userId);
    const instance = await createWeeklyMeeting(teamId, series.id, '2025-01-06');
    
    try {
      const topic = await createMeetingItem(
        instance.id,
        'My Topic',
        'topic',
        userId,
        0
      );
      
      expect(topic.created_by).toBe(userId);
      expect(topic.created_at).toBeTruthy();
      
    } finally {
      await deleteRecurringMeeting(series.id);
    }
  });
});

/**
 * Test 6.4: Topics - add during meeting
 * 
 * When any member adds topic while instance is "in progress"
 * Then it appears in Topics section; order rules apply
 */
test.describe('Meeting Instances - Add Topics During Meeting', () => {
  
  test.skip('should add topics during meeting', async () => {
    // This test would require:
    // 1. Meeting in "in progress" state
    // 2. Adding topics in real-time
    // 3. Topics appearing immediately for all participants
    
    // Expected behavior:
    // - Any team member can add topics
    // - Topics appear immediately in list
    // - Order maintained (FIFO or manual)
    // - Real-time updates if using websockets/polling
  });

  test.skip('should append new topics to end of list', async () => {
    // Expected behavior:
    // - Existing topics 1-5
    // - User adds topic 6
    // - Topic 6 appears at end (order_index 5)
    // - OR user can specify position
  });
});

