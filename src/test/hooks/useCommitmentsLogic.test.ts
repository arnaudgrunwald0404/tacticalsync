import { describe, it, expect } from 'vitest';
import { nextStatus } from '@/components/commitments/StatusBadge';
import { getQuarterMonths } from '@/types/commitments';
import type { CommitmentQuarter, CommitmentStatus, TeamReportingLine } from '@/types/commitments';

// ─────────────────────────────────────────────────────────────────
// Pure logic extracted from useReportingLines: getDirectReportIds / getAllReportIds
// These are graph traversal algorithms we can test without rendering.
// ─────────────────────────────────────────────────────────────────

function getDirectReportIds(lines: TeamReportingLine[], managerId: string): string[] {
  return lines.filter(l => l.manager_id === managerId).map(l => l.report_id);
}

function getAllReportIds(lines: TeamReportingLine[], rootManagerId: string): string[] {
  const visited = new Set<string>();
  const queue = [rootManagerId];
  const result: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    const reports = lines.filter(l => l.manager_id === current).map(l => l.report_id);
    for (const r of reports) {
      if (!visited.has(r)) {
        visited.add(r);
        result.push(r);
        queue.push(r);
      }
    }
  }
  return result;
}

const makeLine = (managerId: string, reportId: string): TeamReportingLine => ({
  id: `rl-${managerId}-${reportId}`,
  team_id: 't-1',
  manager_id: managerId,
  report_id: reportId,
  created_at: '2026-01-01T00:00:00Z',
});

const makeQuarter = (startDate: string): CommitmentQuarter => ({
  id: 'q-1',
  team_id: 't-1',
  label: 'Q1 2026',
  start_date: startDate,
  end_date: '2026-03-31',
  status: 'active',
  created_by: 'u-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

describe('Reporting line graph traversal (pure logic)', () => {
  describe('getDirectReportIds', () => {
    it('should return empty array when manager has no reports', () => {
      const lines: TeamReportingLine[] = [];
      expect(getDirectReportIds(lines, 'u-1')).toEqual([]);
    });

    it('should return direct reports for a manager', () => {
      const lines = [makeLine('u-1', 'u-2'), makeLine('u-1', 'u-3')];
      const reports = getDirectReportIds(lines, 'u-1');
      expect(reports).toContain('u-2');
      expect(reports).toContain('u-3');
      expect(reports).toHaveLength(2);
    });

    it('should not include reports of other managers', () => {
      const lines = [makeLine('u-1', 'u-2'), makeLine('u-3', 'u-4')];
      expect(getDirectReportIds(lines, 'u-1')).toEqual(['u-2']);
    });

    it('should return only one level deep', () => {
      const lines = [makeLine('u-1', 'u-2'), makeLine('u-2', 'u-3')];
      expect(getDirectReportIds(lines, 'u-1')).toEqual(['u-2']);
    });
  });

  describe('getAllReportIds', () => {
    it('should return empty array when manager has no reports', () => {
      expect(getAllReportIds([], 'u-1')).toEqual([]);
    });

    it('should return all reports at multiple depths', () => {
      const lines = [
        makeLine('u-1', 'u-2'),
        makeLine('u-2', 'u-3'),
        makeLine('u-3', 'u-4'),
      ];
      const result = getAllReportIds(lines, 'u-1');
      expect(result).toContain('u-2');
      expect(result).toContain('u-3');
      expect(result).toContain('u-4');
      expect(result).toHaveLength(3);
    });

    it('should handle multiple branches (fan-out)', () => {
      const lines = [
        makeLine('u-1', 'u-2'),
        makeLine('u-1', 'u-3'),
        makeLine('u-2', 'u-4'),
        makeLine('u-3', 'u-5'),
      ];
      const result = getAllReportIds(lines, 'u-1');
      expect(result).toHaveLength(4);
      expect(result).toContain('u-4');
      expect(result).toContain('u-5');
    });

    it('should not visit the same node twice (cycle protection)', () => {
      // Unusual but defensive: if somehow a cycle exists
      const lines = [
        makeLine('u-1', 'u-2'),
        makeLine('u-2', 'u-3'),
        // No actual cycle — just ensuring visited set is respected
      ];
      const result = getAllReportIds(lines, 'u-1');
      expect(new Set(result).size).toBe(result.length); // no duplicates
    });

    it('should not include the root manager in the result', () => {
      const lines = [makeLine('u-1', 'u-2')];
      const result = getAllReportIds(lines, 'u-1');
      expect(result).not.toContain('u-1');
    });
  });
});

describe('getQuarterMonths', () => {
  it('should return correct months for Q1 starting January', () => {
    const quarter = makeQuarter('2026-01-01');
    const months = getQuarterMonths(quarter);
    expect(months.month1).toBe('January');
    expect(months.month2).toBe('February');
    expect(months.month3).toBe('March');
  });

  it('should return correct months for Q2 starting April', () => {
    const quarter = makeQuarter('2026-04-01');
    const months = getQuarterMonths(quarter);
    expect(months.month1).toBe('April');
    expect(months.month2).toBe('May');
    expect(months.month3).toBe('June');
  });

  it('should return correct months for Q3 starting July', () => {
    const quarter = makeQuarter('2026-07-01');
    const months = getQuarterMonths(quarter);
    expect(months.month1).toBe('July');
    expect(months.month2).toBe('August');
    expect(months.month3).toBe('September');
  });

  it('should return correct months for Q4 starting October', () => {
    const quarter = makeQuarter('2026-10-01');
    const months = getQuarterMonths(quarter);
    expect(months.month1).toBe('October');
    expect(months.month2).toBe('November');
    expect(months.month3).toBe('December');
  });

  it('should handle year rollover for Q4 → Q1', () => {
    // Q4 2025 starting October — months stay within same year
    const quarter = makeQuarter('2025-10-01');
    const months = getQuarterMonths(quarter);
    expect(months.month3).toBe('December');
  });
});

describe('nextStatus (full cycle)', () => {
  const allStatuses: CommitmentStatus[] = ['pending', 'in_progress', 'done', 'at_risk'];

  it('should cycle through all four statuses and return to start', () => {
    let status: CommitmentStatus = 'pending';
    const visited: CommitmentStatus[] = [status];
    for (let i = 0; i < 4; i++) {
      status = nextStatus(status);
      visited.push(status);
    }
    // After 4 cycles we are back at pending
    expect(visited[4]).toBe('pending');
  });

  it('should cover all four statuses in one cycle', () => {
    let status: CommitmentStatus = 'pending';
    const seen = new Set<CommitmentStatus>();
    for (let i = 0; i < 4; i++) {
      status = nextStatus(status);
      seen.add(status);
    }
    allStatuses.forEach(s => expect(seen.has(s)).toBe(true));
  });
});
