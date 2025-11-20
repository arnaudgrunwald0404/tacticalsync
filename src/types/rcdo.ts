// RCDO Module Types
// Types for Rallying Cry & Defining Objectives strategic planning

// ============================================================================
// Enums and Status Types
// ============================================================================

export type CycleStatus = 'draft' | 'active' | 'review' | 'archived';
export type CycleType = 'half'; // Only 6-month cycles supported
export type RCStatus = 'draft' | 'committed' | 'in_progress' | 'done';
export type DOStatus = 'draft' | 'active' | 'locked' | 'done';
export type DOHealth = 'on_track' | 'at_risk' | 'off_track' | 'done';
export type MetricType = 'leading' | 'lagging';
export type MetricDirection = 'up' | 'down';
export type MetricSource = 'manual' | 'api' | 'sheet' | 'jira' | 'clearinsights';
export type InitiativeStatus = 'draft' | 'not_started' | 'active' | 'blocked' | 'done';
export type CheckinParentType = 'do' | 'initiative';
export type LinkParentType = 'do' | 'initiative';
export type LinkKind = 'meeting_priority' | 'action_item' | 'topic' | 'decision' | 'jira' | 'doc';

// ============================================================================
// Core Interfaces
// ============================================================================

export interface RCCycle {
  id: string;
  team_id: string;
  type: CycleType;
  start_date: string; // ISO date string
  end_date: string; // ISO date string
  status: CycleStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RallyingCry {
  id: string;
  cycle_id: string;
  title: string;
  narrative: string | null;
  owner_user_id: string;
  status: RCStatus;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DefiningObjective {
  id: string;
  rallying_cry_id: string;
  title: string;
  hypothesis: string | null;
  owner_user_id: string;
  start_date: string | null;
  end_date: string | null;
  status: DOStatus;
  health: DOHealth;
  confidence_pct: number; // 0-100
  locked_at: string | null;
  locked_by: string | null;
  last_health_calc_at: string | null;
  weight_pct: number; // 0-100, for weighted cycle scoring
  display_order: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface DOMetric {
  id: string;
  defining_objective_id: string;
  name: string;
  type: MetricType;
  unit: string | null;
  target_numeric: number | null;
  direction: MetricDirection;
  current_numeric: number | null;
  last_updated_at: string | null;
  source: MetricSource;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface StrategicInitiative {
  id: string;
  defining_objective_id: string;
  title: string;
  description: string | null;
  owner_user_id: string;
  participant_user_ids: string[] | null;
  start_date: string | null;
  end_date: string | null;
  status: InitiativeStatus;
  locked_at: string | null;
  locked_by: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface RCCheckin {
  id: string;
  parent_type: CheckinParentType;
  parent_id: string;
  date: string; // ISO date string
  summary: string | null;
  blockers: string | null;
  next_steps: string | null;
  sentiment: number | null; // -2 to +2
  percent_to_goal: number | null; // 0-100, percentage progress toward goal
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RCLink {
  id: string;
  parent_type: LinkParentType;
  parent_id: string;
  kind: LinkKind;
  ref_id: string;
  created_by: string;
  created_at: string;
}

// ============================================================================
// Extended Types with Relations
// ============================================================================

export interface RCCycleWithRelations extends RCCycle {
  rallying_cry?: RallyingCryWithRelations;
  team?: {
    id: string;
    name: string;
    abbreviated_name?: string;
  };
}

export interface RallyingCryWithRelations extends RallyingCry {
  cycle?: RCCycle;
  defining_objectives?: DefiningObjectiveWithRelations[];
  owner?: {
    id: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    avatar_url?: string;
  };
}

export interface DefiningObjectiveWithRelations extends DefiningObjective {
  rallying_cry?: RallyingCry;
  metrics?: DOMetric[];
  initiatives?: StrategicInitiativeWithRelations[];
  links?: RCLinkWithDetails[];
  owner?: {
    id: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    avatar_url?: string;
  };
}

export interface StrategicInitiativeWithRelations extends StrategicInitiative {
  defining_objective?: DefiningObjective;
  owner?: {
    id: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    avatar_url?: string;
  };
  checkins?: RCCheckin[];
  links?: RCLinkWithDetails[];
}

export interface RCCheckinWithRelations extends RCCheckin {
  creator?: {
    id: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    avatar_url?: string;
  };
}

export interface RCLinkWithDetails extends RCLink {
  creator?: {
    id: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    avatar_url?: string;
  };
  // Details about the linked item (populated based on kind and ref_id)
  linked_item?: {
    title?: string;
    status?: string;
    meeting_id?: string;
    meeting_name?: string;
  };
}

// ============================================================================
// Form and UI Types
// ============================================================================

export interface CreateCycleForm {
  start_date: string;
  end_date: string;
}

export interface CreateRallyingCryForm {
  cycle_id: string;
  title: string;
  narrative?: string;
  owner_user_id: string;
}

export interface CreateDOForm {
  rallying_cry_id: string;
  title: string;
  hypothesis?: string;
  owner_user_id: string;
  start_date?: string;
  end_date?: string;
}

export interface CreateMetricForm {
  defining_objective_id: string;
  name: string;
  type: MetricType;
  unit?: string;
  target_numeric?: number;
  direction: MetricDirection;
}

export interface UpdateMetricForm {
  current_numeric?: number;
  target_numeric?: number;
  unit?: string;
  name?: string;
}

export interface CreateInitiativeForm {
  defining_objective_id: string;
  title: string;
  description?: string;
  owner_user_id: string;
  participant_user_ids?: string[];
  start_date?: string;
  end_date?: string;
}

export interface CreateCheckinForm {
  parent_type: CheckinParentType;
  parent_id: string;
  date: string;
  summary?: string;
  blockers?: string;
  next_steps?: string;
  sentiment?: number;
  percent_to_goal?: number | null; // 0-100, percentage progress toward goal
}

export interface CreateLinkForm {
  parent_type: LinkParentType;
  parent_id: string;
  kind: LinkKind;
  ref_id: string;
}

// ============================================================================
// Validation and Scoring Types
// ============================================================================

export interface CycleValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface DOCommitValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  hasOwner: boolean;
  hasLeadingMetric: boolean;
  hasLaggingMetric: boolean;
}

export interface RCCommitValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  doCount: number;
  allDOsHaveOwners: boolean;
  allDOsHaveMetrics: boolean;
}

export interface MetricStatusResult {
  status: 'on_track' | 'at_risk' | 'off_track' | 'unknown';
  percentComplete: number;
  isAchieved: boolean;
}

export interface DOHealthResult {
  health: DOHealth;
  score: number; // 0-100
  leadingMetricsCount: number;
  onTrackCount: number;
  atRiskCount: number;
  offTrackCount: number;
  calculatedAt: string;
}

export interface CycleScoreResult {
  score: number; // 0-100
  weightedScore: number;
  doScores: Array<{
    do_id: string;
    do_title: string;
    health: DOHealth;
    score: number;
    weight: number;
  }>;
  calculatedAt: string;
}

// ============================================================================
// Hashtag Selector Types
// ============================================================================

export interface DOHashtagOption {
  id: string;
  title: string;
  status: DOStatus;
  health: DOHealth;
  owner_name?: string;
  rallying_cry_title?: string;
}

export interface HashtagSelectorState {
  isOpen: boolean;
  searchQuery: string;
  selectedDO: DOHashtagOption | null;
  cursorPosition: number;
}

