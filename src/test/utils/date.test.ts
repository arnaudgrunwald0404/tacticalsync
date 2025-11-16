import { describe, it, expect } from 'vitest';
import {
  getMondayStartOfWeek,
  getFridayEndOfWeek,
  getMeetingStartDate,
  getMeetingEndDate,
  getNextMeetingStartDate,
  getMeetingPeriodLabel,
  getISODateString
} from '@/lib/dateUtils';

/**
 * Unit tests for date utilities
 */
describe('Date Utilities', () => {
  describe('getMondayStartOfWeek', () => {
    it('should return Monday of the current week', () => {
      // Thursday, October 10, 2025
      const thursday = new Date('2025-10-10T12:00:00Z');
      const monday = getMondayStartOfWeek(thursday);
      
      expect(monday.getDay()).toBe(1); // Monday
      expect(monday.getDate()).toBe(6); // October 6, 2025
    });

    it('should return the same date if already Monday', () => {
      const monday = new Date('2025-10-06T12:00:00Z');
      const result = getMondayStartOfWeek(monday);
      
      expect(result.getDay()).toBe(1);
      expect(result.getDate()).toBe(6);
    });
  });

  describe('getFridayEndOfWeek', () => {
    it('should return Friday of the current week', () => {
      const monday = new Date('2025-10-06T12:00:00Z');
      const friday = getFridayEndOfWeek(monday);
      
      expect(friday.getDay()).toBe(5); // Friday
      expect(friday.getDate()).toBe(10); // October 10, 2025
    });
  });

  describe('getMeetingStartDate', () => {
    it('should return Monday for weekly frequency', () => {
      const thursday = new Date('2025-10-10T12:00:00Z');
      const startDate = getMeetingStartDate('weekly', thursday);
      
      expect(startDate.getDay()).toBe(1); // Monday
    });

    it('should return Monday for bi-weekly frequency', () => {
      const thursday = new Date('2025-10-10T12:00:00Z');
      const startDate = getMeetingStartDate('bi-weekly', thursday);
      
      expect(startDate.getDay()).toBe(1); // Monday
    });

    it('should return first day of month for monthly frequency', () => {
      const midMonth = new Date('2025-10-15T12:00:00Z');
      const startDate = getMeetingStartDate('monthly', midMonth);
      
      expect(startDate.getDate()).toBe(1);
      expect(startDate.getMonth()).toBe(9); // October (0-indexed)
    });

    it('should return first day of quarter for quarterly frequency', () => {
      const midQuarter = new Date('2025-10-15T12:00:00Z');
      const startDate = getMeetingStartDate('quarterly', midQuarter);
      
      expect(startDate.getDate()).toBe(1);
      expect(startDate.getMonth()).toBe(9); // October (0-indexed) - Q4 starts Oct 1
    });

    it('should return same date for daily frequency', () => {
      const date = new Date('2025-10-15T12:00:00Z');
      const startDate = getMeetingStartDate('daily', date);
      
      expect(startDate.getDate()).toBe(15);
    });
  });

  describe('getMeetingEndDate', () => {
    it('should return Sunday for weekly frequency', () => {
      const monday = new Date(2025, 9, 6); // October 6, 2025 (Monday)
      const endDate = getMeetingEndDate('weekly', monday);
      
      expect(endDate.getDay()).toBe(0); // Sunday
      expect(endDate.getDate()).toBe(12); // October 12, 2025
    });

    it('should return Sunday of second week for bi-weekly frequency', () => {
      const monday = new Date(2025, 9, 6); // October 6, 2025 (Monday)
      const endDate = getMeetingEndDate('bi-weekly', monday);
      
      expect(endDate.getDay()).toBe(0); // Sunday
      expect(endDate.getDate()).toBe(19); // October 19, 2025 (Second Sunday)
    });

    it('should return last day of month for monthly frequency', () => {
      const firstOfMonth = new Date(2025, 9, 1); // October 1, 2025
      const endDate = getMeetingEndDate('monthly', firstOfMonth);
      
      expect(endDate.getDate()).toBe(31); // October has 31 days
      expect(endDate.getMonth()).toBe(9); // Still October
    });

    it('should return same date for daily frequency', () => {
      const date = new Date(2025, 9, 15); // October 15, 2025
      const endDate = getMeetingEndDate('daily', date);
      
      expect(endDate.getDate()).toBe(15);
    });
  });

  describe('getNextMeetingStartDate', () => {
    it('should add 1 day for daily frequency', () => {
      const currentStart = new Date(2025, 9, 15); // October 15, 2025
      const nextStart = getNextMeetingStartDate('daily', currentStart);
      
      expect(nextStart.getDate()).toBe(16);
    });

    it('should add 1 week for weekly frequency', () => {
      const currentStart = new Date(2025, 9, 6); // October 6, 2025 (Monday)
      const nextStart = getNextMeetingStartDate('weekly', currentStart);
      
      expect(nextStart.getDate()).toBe(13);
    });

    it('should add 2 weeks for bi-weekly frequency', () => {
      const currentStart = new Date(2025, 9, 6); // October 6, 2025 (Monday)
      const nextStart = getNextMeetingStartDate('bi-weekly', currentStart);
      
      expect(nextStart.getDate()).toBe(20);
    });

    it('should add 1 month for monthly frequency', () => {
      const currentStart = new Date(2025, 9, 1); // October 1, 2025
      const nextStart = getNextMeetingStartDate('monthly', currentStart);
      
      expect(nextStart.getMonth()).toBe(10); // November (0-indexed)
    });

    it('should add 1 quarter for quarterly frequency', () => {
      const currentStart = new Date(2025, 9, 1); // October 1, 2025 (Q4 starts)
      const nextStart = getNextMeetingStartDate('quarterly', currentStart);
      
      expect(nextStart.getMonth()).toBe(0); // January (0-indexed)
      expect(nextStart.getFullYear()).toBe(2026);
    });
  });

  describe('getMeetingPeriodLabel', () => {
    it('should format daily meeting label correctly', () => {
      const date = new Date(2025, 9, 15); // October 15, 2025
      const label = getMeetingPeriodLabel(date, 'daily');
      
      // New format shows full date with day of week: "Wednesday, Oct 15 2025"
      expect(label).toContain('Wednesday');
      expect(label).toContain('Oct 15');
      expect(label).toContain('2025');
    });

    it('should format weekly meeting label correctly', () => {
      const monday = new Date(2025, 9, 6); // October 6, 2025 (Monday)
      const label = getMeetingPeriodLabel(monday, 'weekly');
      
      expect(label).toContain('Week');
      expect(label).toContain('10/6');
      expect(label).toContain('10/12'); // Sunday
    });

    it('should format monthly meeting label correctly', () => {
      const date = new Date(2025, 9, 15); // October 15, 2025
      const label = getMeetingPeriodLabel(date, 'monthly');
      
      expect(label).toContain('Oct 2025');
    });

    it('should format quarterly meeting label correctly', () => {
      const date = new Date(2025, 9, 1); // October 1, 2025 (Q4 starts)
      const label = getMeetingPeriodLabel(date, 'quarterly');
      
      expect(label).toContain('Quarter');
      expect(label).toContain('Q4');
    });
  });

  describe('getISODateString', () => {
    it('should return ISO date string without time', () => {
      const date = new Date('2025-10-11T15:30:00Z');
      const isoString = getISODateString(date);
      
      expect(isoString).toBe('2025-10-11');
    });

    it('should handle different dates correctly', () => {
      const date = new Date('2024-01-01T23:59:59Z');
      const isoString = getISODateString(date);
      
      expect(isoString).toBe('2024-01-01');
    });
  });
});
