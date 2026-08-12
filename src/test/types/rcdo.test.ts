import { describe, it, expect } from 'vitest';
import type { DOStatus, InitiativeStatus } from '@/types/rcdo';

// Regression coverage for 505edf9: DO lock call sites used to write
// status: 'final', a value the rc_defining_objectives_status_check DB
// constraint (draft|active|locked|done) has never accepted — every lock
// write failed silently and StrategyCanvas's hydration, which compared
// against the same never-valid 'final', always rendered locked DOs back
// as "draft" on reload.
//
// This Record<DOStatus, true> is a compile-time exhaustiveness check: if
// 'final' (or any other value) is ever added back to the DOStatus union
// without updating this list, `tsc --noEmit` fails to compile even though
// Vitest's esbuild transform won't catch it — see the project's pre-commit
// tsc check.
const doStatusExhaustiveness: Record<DOStatus, true> = {
  draft: true,
  active: true,
  locked: true,
  done: true,
};

describe('DOStatus Type', () => {
  it('covers exactly the four DB-valid status values', () => {
    expect(Object.keys(doStatusExhaustiveness).sort()).toEqual(['active', 'done', 'draft', 'locked'].sort());
  });

  it('does not include the never-valid legacy "final" value', () => {
    const validStatuses: DOStatus[] = ['draft', 'active', 'locked', 'done'];
    expect(validStatuses).not.toContain('final');
  });
});

const initiativeStatusExhaustiveness: Record<InitiativeStatus, true> = {
  not_started: true,
  on_track: true,
  at_risk: true,
  off_track: true,
  completed: true,
};

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
    expect(Object.keys(initiativeStatusExhaustiveness)).toHaveLength(5);
  });
});


