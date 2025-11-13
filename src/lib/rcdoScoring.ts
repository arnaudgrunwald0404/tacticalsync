// RCDO Scoring and Health Calculation Logic

import type {
  DOMetric,
  DefiningObjective,
  MetricStatusResult,
  DOHealthResult,
  CycleScoreResult,
  DOHealth,
} from '@/types/rcdo';

/**
 * Calculate the status of a single metric
 * @param metric - The metric to evaluate
 * @returns Status result with completion percentage
 */
export function calculateMetricStatus(metric: DOMetric): MetricStatusResult {
  if (
    metric.current_numeric === null ||
    metric.target_numeric === null ||
    metric.target_numeric === 0
  ) {
    return {
      status: 'unknown',
      percentComplete: 0,
      isAchieved: false,
    };
  }

  const current = metric.current_numeric;
  const target = metric.target_numeric;
  let percentComplete: number;
  let isAchieved: boolean;

  if (metric.direction === 'up') {
    // For "up" metrics, higher is better
    percentComplete = Math.min(100, Math.max(0, (current / target) * 100));
    isAchieved = current >= target;
  } else {
    // For "down" metrics, lower is better
    if (current <= target) {
      percentComplete = 100;
      isAchieved = true;
    } else {
      percentComplete = Math.max(0, 100 - ((current - target) / target) * 100);
      isAchieved = false;
    }
  }

  // Determine status based on percentage
  let status: 'on_track' | 'at_risk' | 'off_track' | 'unknown';
  if (percentComplete >= 80) {
    status = 'on_track';
  } else if (percentComplete >= 50) {
    status = 'at_risk';
  } else {
    status = 'off_track';
  }

  return {
    status,
    percentComplete,
    isAchieved,
  };
}

/**
 * Calculate the health of a Defining Objective based on its leading metrics
 * @param doId - The DO ID
 * @param metrics - Array of all metrics for the DO
 * @returns Health result with score and breakdown
 */
export function calculateDOHealth(
  doId: string,
  metrics: DOMetric[]
): DOHealthResult {
  // Filter to only leading metrics (they drive health calculation)
  const leadingMetrics = metrics.filter((m) => m.type === 'leading');

  if (leadingMetrics.length === 0) {
    return {
      health: 'on_track',
      score: 50,
      leadingMetricsCount: 0,
      onTrackCount: 0,
      atRiskCount: 0,
      offTrackCount: 0,
      calculatedAt: new Date().toISOString(),
    };
  }

  // Calculate status for each leading metric
  const metricStatuses = leadingMetrics.map(calculateMetricStatus);

  // Count metrics by status
  const onTrackCount = metricStatuses.filter((s) => s.status === 'on_track').length;
  const atRiskCount = metricStatuses.filter((s) => s.status === 'at_risk').length;
  const offTrackCount = metricStatuses.filter((s) => s.status === 'off_track').length;

  // Calculate overall score (weighted average)
  const totalScore = metricStatuses.reduce(
    (sum, status) => sum + status.percentComplete,
    0
  );
  const score = totalScore / leadingMetrics.length;

  // Determine overall health
  let health: DOHealth;
  if (score >= 80) {
    health = 'on_track';
  } else if (score >= 50) {
    health = 'at_risk';
  } else {
    health = 'off_track';
  }

  return {
    health,
    score,
    leadingMetricsCount: leadingMetrics.length,
    onTrackCount,
    atRiskCount,
    offTrackCount,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate the overall score for a cycle based on all DOs
 * @param dos - Array of defining objectives with their metrics
 * @returns Cycle score with weighted breakdown
 */
export function calculateCycleScore(
  dos: Array<DefiningObjective & { metrics?: DOMetric[] }>
): CycleScoreResult {
  if (dos.length === 0) {
    return {
      score: 0,
      weightedScore: 0,
      doScores: [],
      calculatedAt: new Date().toISOString(),
    };
  }

  const doScores = dos.map((doItem) => {
    const healthResult = calculateDOHealth(doItem.id, doItem.metrics || []);

    return {
      do_id: doItem.id,
      do_title: doItem.title,
      health: healthResult.health,
      score: healthResult.score,
      weight: doItem.weight_pct || 0,
    };
  });

  // Calculate total weight
  const totalWeight = doScores.reduce((sum, ds) => sum + ds.weight, 0);

  // Calculate weighted score
  let weightedScore = 0;
  if (totalWeight > 0) {
    weightedScore = doScores.reduce((sum, ds) => {
      return sum + (ds.score * ds.weight) / totalWeight;
    }, 0);
  } else {
    // If no weights set, use simple average
    weightedScore = doScores.reduce((sum, ds) => sum + ds.score, 0) / doScores.length;
  }

  // Simple average for comparison
  const simpleScore = doScores.reduce((sum, ds) => sum + ds.score, 0) / doScores.length;

  return {
    score: simpleScore,
    weightedScore,
    doScores,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Get color class for health status
 */
export function getHealthColor(health: DOHealth): string {
  const colors = {
    on_track: 'text-green-600 dark:text-green-400',
    at_risk: 'text-yellow-600 dark:text-yellow-400',
    off_track: 'text-red-600 dark:text-red-400',
    done: 'text-purple-600 dark:text-purple-400',
  };
  return colors[health];
}

/**
 * Get background color class for health status
 */
export function getHealthBgColor(health: DOHealth): string {
  const colors = {
    on_track: 'bg-green-100 dark:bg-green-900',
    at_risk: 'bg-yellow-100 dark:bg-yellow-900',
    off_track: 'bg-red-100 dark:bg-red-900',
    done: 'bg-purple-100 dark:bg-purple-900',
  };
  return colors[health];
}

/**
 * Format score for display
 */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

/**
 * Get a human-readable description of health status
 */
export function getHealthDescription(health: DOHealth): string {
  const descriptions = {
    on_track:
      'This objective is performing well. Leading metrics indicate strong progress toward goals.',
    at_risk:
      'This objective needs attention. Some leading metrics are below target but recovery is possible.',
    off_track:
      'This objective requires immediate action. Leading metrics are significantly below target.',
    done: 'This objective has been completed successfully.',
  };
  return descriptions[health];
}

