export type QuarterStatus = 'draft' | 'active' | 'archived';
export type CommitmentStatus = 'pending' | 'in_progress' | 'done' | 'at_risk';

export interface CommitmentQuarter {
  id: string;
  team_id: string;
  label: string;         // "Q1 2026"
  start_date: string;    // ISO date
  end_date: string;
  status: QuarterStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamReportingLine {
  id: string;
  team_id: string;
  manager_id: string;
  report_id: string;
  created_at: string;
}

export interface PersonalPriority {
  id: string;
  quarter_id: string;
  user_id: string;
  title: string;
  description: string | null;
  display_order: number; // 1-3
  created_at: string;
  updated_at: string;
}

export interface MonthlyCommitment {
  id: string;
  quarter_id: string;
  user_id: string;
  month_number: number;  // 1=first month of quarter, 2=second, 3=third
  title: string;
  description: string | null;
  status: CommitmentStatus;
  display_order: number; // 1-3
  created_at: string;
  updated_at: string;
}

// Derived: all commitments for one person in one quarter
export interface PersonCommitments {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  avatarName: string | null;
  priorities: PersonalPriority[];              // up to 3
  commitments: Record<number, MonthlyCommitment[]>; // month_number → up to 3 commitments
}

// Month label helper (index 0-2 → actual month name)
export interface QuarterMonths {
  month1: string; // e.g. "January"
  month2: string; // e.g. "February"
  month3: string; // e.g. "March"
}

export function getQuarterMonths(quarter: CommitmentQuarter): QuarterMonths {
  const date = new Date(quarter.start_date + 'T00:00:00');
  const fmt = (d: Date) => d.toLocaleString('default', { month: 'long' });
  const m1 = new Date(date);
  const m2 = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const m3 = new Date(date.getFullYear(), date.getMonth() + 2, 1);
  return { month1: fmt(m1), month2: fmt(m2), month3: fmt(m3) };
}

export interface CreateQuarterForm {
  label: string;
  start_date: string;
  end_date: string;
}

export interface UpsertPriorityForm {
  id?: string;
  quarter_id: string;
  user_id: string;
  title: string;
  description?: string;
  display_order: number;
}

export interface UpsertCommitmentForm {
  id?: string;
  quarter_id: string;
  user_id: string;
  month_number: number;
  title: string;
  description?: string;
  status?: CommitmentStatus;
  display_order: number;
}
