import { describe, it, expect } from 'vitest';
import { formatDate, parseDate } from '@/lib/dateUtils';

/**
 * Example unit tests for date utilities
 * 
 * This demonstrates how to write unit tests with Vitest
 */
describe('Date Utilities', () => {
  describe('formatDate', () => {
    it('should format date in ISO format', () => {
      const date = new Date('2025-10-11T12:00:00Z');
      const formatted = formatDate(date, 'yyyy-MM-dd');
      expect(formatted).toBe('2025-10-11');
    });

    it('should handle invalid dates gracefully', () => {
      const invalidDate = new Date('invalid');
      const formatted = formatDate(invalidDate, 'yyyy-MM-dd');
      // Depending on your implementation, adjust the expectation
      expect(formatted).toBeDefined();
    });
  });

  describe('parseDate', () => {
    it('should parse ISO date string', () => {
      const dateString = '2025-10-11';
      const parsed = parseDate(dateString);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.getFullYear()).toBe(2025);
      expect(parsed.getMonth()).toBe(9); // JavaScript months are 0-indexed
      expect(parsed.getDate()).toBe(11);
    });
  });
});

/**
 * Note: The above tests assume your dateUtils exports formatDate and parseDate.
 * If these don't exist yet, the tests will fail - which is actually useful
 * for Test-Driven Development (TDD)!
 * 
 * Adjust the imports and test cases based on your actual utility functions.
 */

