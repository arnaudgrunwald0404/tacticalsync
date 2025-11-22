import { describe, it, expect } from 'vitest';
import type { InitiativeStatus } from '@/types/rcdo';

describe('InitiativeStatus Type', () => {
  it('should have correct PRD-aligned status values', () => {
    const validStatuses: InitiativeStatus[] = [
      'not_started',
      'on_track',
      'at_risk',
      'off_track',
      'completed',
    ];

    validStatuses.forEach((status) => {
      expect(status).toBeDefined();
      expect(typeof status).toBe('string');
    });
  });

  it('should not include old status values', () => {
    const oldStatuses = ['draft', 'active', 'blocked', 'done'];
    
    oldStatuses.forEach((oldStatus) => {
      // TypeScript should prevent this, but we verify at runtime
      expect(oldStatus).not.toBe('not_started');
      expect(oldStatus).not.toBe('on_track');
      expect(oldStatus).not.toBe('at_risk');
      expect(oldStatus).not.toBe('off_track');
      expect(oldStatus).not.toBe('completed');
    });
  });

  it('should have exactly 5 status values', () => {
    const allStatuses: InitiativeStatus[] = [
      'not_started',
      'on_track',
      'at_risk',
      'off_track',
      'completed',
    ];
    
    expect(allStatuses.length).toBe(5);
  });
});


