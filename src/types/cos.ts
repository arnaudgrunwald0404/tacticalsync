// ── CoS layout configuration types & defaults ───────────────────────────────

// Legacy types — kept only for migrateOldSettings()
interface CosCol1Section { key: string; label: string | null; auto_label: boolean; enabled: boolean; }
interface CosCol2Section { key: string; label: string; enabled: boolean; }

export type CosSectionType =
  | 'now' | 'this_week' | 'next_week'
  | 'this_month_auto' | 'next_month_auto' | 'next_quarter_auto'
  | 'direct_reports'
  | 'person'
  | 'custom';

export interface CosColumnSection {
  id: string;
  type: CosSectionType;
  label: string | null;
  enabled: boolean;
  memberId?: string;
}

export interface CosColumn {
  id: string;
  headerLabel: string;
  widthPct: number;
  sections: CosColumnSection[];
}

export interface CosLayoutConfig {
  columnCount: 3 | 4;
  columns: CosColumn[];
}

export const DEFAULT_STATUS_OPTIONS = ['WIP', 'WOS', 'Done'];

const AUTO_SECTION_TYPES: CosSectionType[] = [
  'this_month_auto', 'next_month_auto', 'next_quarter_auto', 'direct_reports', 'person',
];

export function isAutoType(t: CosSectionType): boolean {
  return AUTO_SECTION_TYPES.includes(t);
}

export const SECTION_TYPE_LABELS: Record<CosSectionType, string> = {
  now:              'Now',
  this_week:        'This Week',
  next_week:        'Next Week',
  this_month_auto:  'This Month (auto)',
  next_month_auto:  'Next Month (auto)',
  next_quarter_auto:'Next Quarter (auto)',
  direct_reports:   'Direct Reports',
  custom:           'Custom',
};

export function resolveNewSectionLabel(section: CosColumnSection): string {
  if (section.type === 'direct_reports') return section.label ?? 'Direct Reports';
  if (section.type === 'this_month_auto') {
    if (section.label) return section.label;
    return new Date().toLocaleString('default', { month: 'long' });
  }
  if (section.type === 'next_month_auto') {
    if (section.label) return section.label;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleString('default', { month: 'long' });
  }
  if (section.type === 'next_quarter_auto') {
    if (section.label) return section.label;
    const currentQ = Math.floor(new Date().getMonth() / 3) + 1;
    return `Q${(currentQ % 4) + 1}`;
  }
  return section.label ?? SECTION_TYPE_LABELS[section.type] ?? section.id;
}

export function sectionToCategoryKey(section: CosColumnSection): string {
  if (section.type === 'this_month_auto')   return 'this_month';
  if (section.type === 'next_month_auto')   return 'next_month';
  if (section.type === 'next_quarter_auto') return 'next_quarter';
  if (section.type === 'now' || section.type === 'this_week' || section.type === 'next_week') return section.type;
  return section.id;
}

export const DEFAULT_LAYOUT_CONFIG: CosLayoutConfig = {
  columnCount: 3,
  columns: [
    { id: 'col1', headerLabel: 'My Lists', widthPct: 33, sections: [
      { id: 'now',          type: 'now',              label: 'Now',       enabled: true  },
      { id: 'this_week',    type: 'this_week',         label: 'This Week', enabled: true  },
      { id: 'next_week',    type: 'next_week',         label: 'Next Week', enabled: false },
      { id: 'this_month',   type: 'this_month_auto',   label: null,        enabled: true  },
      { id: 'next_month',   type: 'next_month_auto',   label: null,        enabled: true  },
      { id: 'next_quarter', type: 'next_quarter_auto', label: null,        enabled: false },
    ]},
    { id: 'col2', headerLabel: 'Strategic', widthPct: 33, sections: [
      { id: 'strategic', type: 'custom', label: 'Strategic Opportunities', enabled: true },
      { id: 'people',    type: 'custom', label: 'People to Meet',          enabled: true },
    ]},
    { id: 'col3', headerLabel: 'Direct Reports', widthPct: 34, sections: [
      { id: 'direct_reports', type: 'direct_reports', label: null, enabled: true },
    ]},
  ],
};

export function totalWidthPct(columns: CosColumn[]): number {
  return columns.reduce((sum, c) => sum + (c.widthPct || 0), 0);
}

export function adjustColumnCount(config: CosLayoutConfig, newCount: 3 | 4): CosLayoutConfig {
  if (newCount === 4 && config.columnCount === 3) {
    const cols = [...config.columns.map(c => ({ ...c, widthPct: 25 })),
      { id: 'col4', headerLabel: 'Column 4', widthPct: 25, sections: [] as CosColumnSection[] }];
    return { columnCount: 4, columns: cols };
  }
  if (newCount === 3 && config.columnCount === 4) {
    const cols = config.columns.slice(0, 3).map((c, i) => ({ ...c, widthPct: i === 2 ? 34 : 33 }));
    return { columnCount: 3, columns: cols };
  }
  return config;
}

const OLD_KEY_TO_TYPE: Record<string, CosSectionType> = {
  now: 'now', this_week: 'this_week', next_week: 'next_week',
  this_month: 'this_month_auto', next_month: 'next_month_auto', next_quarter: 'next_quarter_auto',
};

export function migrateOldSettings(raw: Record<string, unknown>): CosLayoutConfig {
  const tabLabels = (raw.tab_labels ?? {}) as Record<string, string>;
  const col1      = (raw.col1_sections ?? []) as CosCol1Section[];
  const col2      = (raw.col2_sections ?? []) as CosCol2Section[];
  const col3Label = (raw.col3_label as string | undefined) ?? 'Direct Reports';

  const col1Sections: CosColumnSection[] = col1.map(s => ({
    id: s.key,
    type: s.key.startsWith('custom_') ? 'custom' : (OLD_KEY_TO_TYPE[s.key] ?? 'custom'),
    label: s.label,
    enabled: s.enabled,
  }));

  const col2Sections: CosColumnSection[] = col2.map(s => ({
    id: s.key, type: 'custom' as CosSectionType, label: s.label, enabled: s.enabled,
  }));

  return {
    columnCount: 3,
    columns: [
      { id: 'col1', headerLabel: tabLabels.priorities ?? 'My Lists', widthPct: 33, sections: col1Sections },
      { id: 'col2', headerLabel: 'Strategic',                          widthPct: 33, sections: col2Sections },
      { id: 'col3', headerLabel: col3Label,                            widthPct: 34, sections: [
        { id: 'direct_reports', type: 'direct_reports', label: null, enabled: true },
      ]},
    ],
  };
}
