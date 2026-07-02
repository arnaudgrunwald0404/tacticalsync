import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type DelegationStatus =
  | 'ramping_up' | 'clarifying' | 'planning'
  | 'getting_it_done' | 'seeking_approval' | 'done' | 'cancelled';

export interface ClarifyingQuestion {
  question: string;
  choices: string[];
  _all: ClarifyingQuestion[];
  _idx: number;
}

export interface LogEntry {
  timestamp: string;
  text: string;
}

export interface Delegation {
  id: string;
  item_id: string;
  status: DelegationStatus;
  agent_log: LogEntry[];
  current_question: ClarifyingQuestion | null;
  answers: Record<string, string>;
  plan: string | null;
  result: string | null;
  approval_summary: string | null;
  created_at: string;
}

// The generated Row types the jsonb columns as Json; the domain Delegation
// narrows them to their real shapes. This mapper is the one boundary cast.
type DelegationRow = Database['public']['Tables']['inbox_delegations']['Row'];
const rowToDelegation = (r: DelegationRow): Delegation => ({
  id: r.id,
  item_id: r.item_id,
  status: r.status as DelegationStatus,
  agent_log: (r.agent_log as unknown as LogEntry[]) ?? [],
  current_question: (r.current_question as unknown as ClarifyingQuestion | null) ?? null,
  answers: (r.answers as unknown as Record<string, string>) ?? {},
  plan: r.plan,
  result: r.result,
  approval_summary: r.approval_summary,
  created_at: r.created_at,
});

export function useInboxDelegation(itemId: string | null) {
  const [delegation, setDelegation] = useState<Delegation | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!itemId) return;

    // Initial fetch
    supabase
      .from('inbox_delegations')
      .select('*')
      .eq('item_id', itemId)
      .not('status', 'in', '("done","cancelled")')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        setDelegation(data?.[0] ? rowToDelegation(data[0]) : null);
      });

    // Realtime subscription
    const channel = supabase
      .channel(`delegation:${itemId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_delegations', filter: `item_id=eq.${itemId}` },
        (payload) => {
          const row = payload.new as DelegationRow;
          if (row?.id) setDelegation(rowToDelegation(row));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [itemId]);

  const startDelegation = useCallback(async (userId: string) => {
    if (!itemId) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delegate-inbox-task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'start', item_id: itemId, user_id: userId }),
      });
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  const submitAnswer = useCallback(async (answer: string) => {
    if (!delegation) return;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delegate-inbox-task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action: 'answer', delegation_id: delegation.id, answer }),
    });
  }, [delegation]);

  const approve = useCallback(async () => {
    if (!delegation) return;
    await supabase
      .from('inbox_delegations')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', delegation.id);
  }, [delegation]);

  return { delegation, loading, startDelegation, submitAnswer, approve };
}
