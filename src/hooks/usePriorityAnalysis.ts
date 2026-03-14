import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { PersonalPriority, MonthlyCommitment } from '@/types/commitments';

export type PriorityCategory = 'churn_reduction' | 'net_new_functionality' | 'net_new_accounts' | 'uncategorized';

export interface PriorityCategorization {
  id: string;
  item_type: 'priority' | 'commitment';
  item_id: string;
  category: PriorityCategory;
  created_at: string;
  updated_at: string;
}

export interface CategoryBreakdown {
  category: PriorityCategory;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface AnalysisSummary {
  totalItems: number;
  categorizedItems: number;
  uncategorizedItems: number;
  breakdown: CategoryBreakdown[];
  priorityBreakdown: CategoryBreakdown[];
  commitmentBreakdown: CategoryBreakdown[];
}

const CATEGORY_META: Record<PriorityCategory, { label: string; color: string }> = {
  churn_reduction: { label: 'Churn Reduction', color: '#C97D60' },
  net_new_functionality: { label: 'Net New Functionality', color: '#4A5D5F' },
  net_new_accounts: { label: 'Net New Accounts', color: '#7B9E89' },
  uncategorized: { label: 'Uncategorized', color: '#9CA3AF' },
};

function buildBreakdown(items: { category: PriorityCategory }[]): CategoryBreakdown[] {
  const counts: Record<PriorityCategory, number> = {
    churn_reduction: 0,
    net_new_functionality: 0,
    net_new_accounts: 0,
    uncategorized: 0,
  };
  items.forEach(i => { counts[i.category] = (counts[i.category] ?? 0) + 1; });
  const total = items.length || 1;
  return (Object.keys(counts) as PriorityCategory[]).map(cat => ({
    category: cat,
    label: CATEGORY_META[cat].label,
    count: counts[cat],
    percentage: Math.round((counts[cat] / total) * 100),
    color: CATEGORY_META[cat].color,
  }));
}

export function usePriorityAnalysis(
  quarterId: string | null,
  priorities: PersonalPriority[],
  commitments: MonthlyCommitment[],
) {
  const [categorizations, setCategorizations] = useState<PriorityCategorization[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchCategorizations = useCallback(async () => {
    if (!quarterId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('priority_categorizations')
        .select('*')
        .eq('quarter_id', quarterId);
      if (error) throw error;
      setCategorizations((data ?? []) as PriorityCategorization[]);
    } catch (err: any) {
      // Table may not exist yet — treat as empty
      setCategorizations([]);
    } finally {
      setLoading(false);
    }
  }, [quarterId]);

  useEffect(() => { fetchCategorizations(); }, [fetchCategorizations]);

  const setCategorization = useCallback(async (
    itemType: 'priority' | 'commitment',
    itemId: string,
    category: PriorityCategory,
  ) => {
    if (!quarterId) return;
    try {
      const { error } = await supabase
        .from('priority_categorizations')
        .upsert(
          {
            quarter_id: quarterId,
            item_type: itemType,
            item_id: itemId,
            category,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'item_type,item_id' },
        );
      if (error) throw error;
      await fetchCategorizations();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }, [quarterId, fetchCategorizations, toast]);

  // Build lookup
  const catMap = useMemo(() => {
    const map = new Map<string, PriorityCategory>();
    categorizations.forEach(c => map.set(`${c.item_type}:${c.item_id}`, c.category));
    return map;
  }, [categorizations]);

  const getCategory = useCallback(
    (itemType: 'priority' | 'commitment', itemId: string): PriorityCategory =>
      catMap.get(`${itemType}:${itemId}`) ?? 'uncategorized',
    [catMap],
  );

  // Build analysis summary
  const summary: AnalysisSummary = useMemo(() => {
    const allPriItems = priorities.map(p => ({ category: getCategory('priority', p.id) }));
    const allComItems = commitments.map(c => ({ category: getCategory('commitment', c.id) }));
    const allItems = [...allPriItems, ...allComItems];

    const categorizedItems = allItems.filter(i => i.category !== 'uncategorized').length;

    return {
      totalItems: allItems.length,
      categorizedItems,
      uncategorizedItems: allItems.length - categorizedItems,
      breakdown: buildBreakdown(allItems),
      priorityBreakdown: buildBreakdown(allPriItems),
      commitmentBreakdown: buildBreakdown(allComItems),
    };
  }, [priorities, commitments, getCategory]);

  return {
    categorizations,
    loading,
    summary,
    getCategory,
    setCategorization,
    refetch: fetchCategorizations,
  };
}
