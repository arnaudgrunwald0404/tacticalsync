// RCDO Validation Logic
// Implements guardrails for cycle activation, DO commit, and locking

import type {
  RCCycle,
  DefiningObjective,
  DOMetric,
  CycleValidationResult,
  DOCommitValidationResult,
  RCCommitValidationResult,
} from '@/types/rcdo';
import { supabase } from '@/integrations/supabase/client';
import { differenceInMonths, parseISO, addMonths } from 'date-fns';

/**
 * Validate that a cycle meets the 6-month requirement and doesn't overlap
 */
export async function validateCycleActivation(
  cycle: RCCycle
): Promise<CycleValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 6-month duration
  const startDate = parseISO(cycle.start_date);
  const endDate = parseISO(cycle.end_date);
  const expectedEndDate = addMonths(startDate, 6);
  expectedEndDate.setDate(expectedEndDate.getDate() - 1); // Subtract one day

  const monthsDiff = differenceInMonths(endDate, startDate);
  if (monthsDiff !== 6) {
    errors.push('Cycle must be exactly 6 months in duration');
  }

  // Check for overlapping active cycles in the same team
  const { data: overlappingCycles, error } = await supabase
    .from('rc_cycles')
    .select('id, start_date, end_date')
    .eq('team_id', cycle.team_id)
    .eq('status', 'active')
    .neq('id', cycle.id);

  if (error) {
    errors.push('Failed to check for overlapping cycles');
  } else if (overlappingCycles && overlappingCycles.length > 0) {
    errors.push('Only one active cycle allowed per team at a time');
  }

  // Warning if cycle doesn't start on Jan 1 or Jul 1
  const month = startDate.getMonth();
  const day = startDate.getDate();
  if (!((month === 0 && day === 1) || (month === 6 && day === 1))) {
    warnings.push('Recommended cycle start dates are January 1 or July 1');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate that a DO is ready to be committed
 * Requires: single owner, at least 1 leading metric, at least 1 lagging metric
 */
export async function validateDOCommit(
  doId: string
): Promise<DOCommitValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Fetch DO details
  const { data: doData, error: doError } = await supabase
    .from('rc_defining_objectives')
    .select('*, metrics:rc_do_metrics(*)')
    .eq('id', doId)
    .single();

  if (doError || !doData) {
    return {
      valid: false,
      errors: ['Failed to fetch DO details'],
      warnings: [],
      hasOwner: false,
      hasLeadingMetric: false,
      hasLaggingMetric: false,
    };
  }

  const doItem = doData as DefiningObjective & { metrics: DOMetric[] };

  // Check for owner
  const hasOwner = !!doItem.owner_user_id;
  if (!hasOwner) {
    errors.push('DO must have exactly one owner before activation');
  }

  // Check for metrics
  const metrics = doItem.metrics || [];
  const leadingMetrics = metrics.filter((m) => m.type === 'leading');
  const laggingMetrics = metrics.filter((m) => m.type === 'lagging');

  const hasLeadingMetric = leadingMetrics.length > 0;
  const hasLaggingMetric = laggingMetrics.length > 0;

  if (!hasLeadingMetric) {
    errors.push('DO must have at least one leading metric');
  }

  if (!hasLaggingMetric) {
    errors.push('DO must have at least one lagging metric');
  }

  // Warnings for metrics without targets
  const metricsWithoutTargets = metrics.filter((m) => m.target_numeric === null);
  if (metricsWithoutTargets.length > 0) {
    warnings.push(
      `${metricsWithoutTargets.length} metric(s) do not have target values set`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    hasOwner,
    hasLeadingMetric,
    hasLaggingMetric,
  };
}

/**
 * Validate that a Rallying Cry is ready to be committed
 * Requires: 4-6 DOs, each DO meets commit requirements
 */
export async function validateRCCommit(
  rallyingCryId: string
): Promise<RCCommitValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Fetch all DOs for this rallying cry
  const { data: dos, error: dosError } = await supabase
    .from('rc_defining_objectives')
    .select('*, metrics:rc_do_metrics(*)')
    .eq('rallying_cry_id', rallyingCryId);

  if (dosError || !dos) {
    return {
      valid: false,
      errors: ['Failed to fetch defining objectives'],
      warnings: [],
      doCount: 0,
      allDOsHaveOwners: false,
      allDOsHaveMetrics: false,
    };
  }

  const doCount = dos.length;

  // Check DO count (4-6 recommended)
  if (doCount < 4) {
    errors.push('Rallying Cry should have at least 4 Defining Objectives');
  }
  if (doCount > 6) {
    warnings.push(
      'Rallying Cry has more than 6 DOs. Consider consolidating for focus.'
    );
  }
  if (doCount === 0) {
    errors.push('Rallying Cry must have at least one Defining Objective');
  }

  // Validate each DO
  let allDOsHaveOwners = true;
  let allDOsHaveMetrics = true;

  for (const doItem of dos) {
    const doWithMetrics = doItem as DefiningObjective & { metrics: DOMetric[] };

    // Check owner
    if (!doWithMetrics.owner_user_id) {
      allDOsHaveOwners = false;
      errors.push(`DO "${doWithMetrics.title}" is missing an owner`);
    }

    // Check metrics
    const metrics = doWithMetrics.metrics || [];
    const hasLeading = metrics.some((m) => m.type === 'leading');
    const hasLagging = metrics.some((m) => m.type === 'lagging');

    if (!hasLeading || !hasLagging) {
      allDOsHaveMetrics = false;
      if (!hasLeading) {
        errors.push(`DO "${doWithMetrics.title}" is missing a leading metric`);
      }
      if (!hasLagging) {
        errors.push(`DO "${doWithMetrics.title}" is missing a lagging metric`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    doCount,
    allDOsHaveOwners,
    allDOsHaveMetrics,
  };
}

/**
 * Check if a user can lock a DO
 */
export function canLockDO(
  isTeamAdmin: boolean,
  isSuperAdmin: boolean
): boolean {
  return isTeamAdmin || isSuperAdmin;
}

/**
 * Check if a user can unlock a DO
 */
export function canUnlockDO(
  isTeamAdmin: boolean,
  isSuperAdmin: boolean
): boolean {
  return isTeamAdmin || isSuperAdmin;
}

/**
 * Validate that dates are in correct order
 */
export function validateDateOrder(
  startDate: string,
  endDate: string
): { valid: boolean; error?: string } {
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  if (start >= end) {
    return {
      valid: false,
      error: 'End date must be after start date',
    };
  }

  return { valid: true };
}

/**
 * Suggest optimal cycle dates based on current date
 * Returns either Jan 1 - Jun 30 or Jul 1 - Dec 31
 */
export function suggestCycleDates(): { start_date: string; end_date: string } {
  const now = new Date();
  const currentMonth = now.getMonth();

  if (currentMonth < 6) {
    // Suggest Jan 1 - Jun 30
    const year = now.getFullYear();
    return {
      start_date: `${year}-01-01`,
      end_date: `${year}-06-30`,
    };
  } else {
    // Suggest Jul 1 - Dec 31
    const year = now.getFullYear();
    return {
      start_date: `${year}-07-01`,
      end_date: `${year}-12-31`,
    };
  }
}

