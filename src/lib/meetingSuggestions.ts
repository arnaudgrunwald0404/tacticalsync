import {
  CosLayoutConfig, sectionToCategoryKey, resolveNewSectionLabel,
} from '@/types/cos';

/** A destination list on the board: a column header + section label + the
 *  cos_priorities category key items land in. */
export interface TargetOption {
  category: string;
  columnLabel: string;
  sectionLabel: string;
}

/** Flatten the layout into the user-pickable destination lists, skipping
 *  disabled sections and the direct-reports section (not a task list). */
export function buildTargetOptions(layout: CosLayoutConfig | null | undefined): TargetOption[] {
  if (!layout?.columns) return [];
  const opts: TargetOption[] = [];
  for (const col of layout.columns) {
    for (const sec of col.sections ?? []) {
      if (!sec.enabled || sec.type === 'direct_reports') continue;
      opts.push({
        category: sectionToCategoryKey(sec),
        columnLabel: col.headerLabel,
        sectionLabel: resolveNewSectionLabel(sec),
      });
    }
  }
  return opts;
}

/** Resolve a suggested category key to its destination list, falling back to
 *  the first available list when the key is missing/stale. */
export function resolveTarget(
  category: string | null | undefined,
  options: TargetOption[],
): TargetOption | undefined {
  if (!options.length) return undefined;
  return options.find(o => o.category === category) ?? options[0];
}
