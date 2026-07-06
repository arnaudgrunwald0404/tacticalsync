import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PersonAccountability {
  id: string;
  user_id: string;
  member_id: string;
  text: string;
  sort_order: number;
}

export interface PersonTopic {
  id: string;
  user_id: string;
  member_id: string;
  text: string;
  status: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  flagged: boolean;
}

/**
 * Accountabilities + discussion topics for a single team member — the same
 * data Chief of Staff's person cards show, scoped down for use in a compact
 * widget (e.g. the inbox assistant panel) rather than the full multi-person page.
 */
export function usePersonAccountabilitiesTopics(userId: string | null, memberId: string | null) {
  const [accountabilities, setAccountabilities] = useState<PersonAccountability[]>([]);
  const [topics, setTopics] = useState<PersonTopic[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!userId || !memberId) {
      setAccountabilities([]);
      setTopics([]);
      return;
    }
    setLoading(true);
    const [acctRes, topicsRes] = await Promise.all([
      supabase.from('cos_person_accountabilities').select('*').eq('user_id', userId).eq('member_id', memberId).order('sort_order'),
      supabase.from('cos_person_topics').select('*').eq('user_id', userId).eq('member_id', memberId).order('sort_order'),
    ]);
    setAccountabilities(acctRes.data ?? []);
    setTopics(topicsRes.data ?? []);
    setLoading(false);
  }, [userId, memberId]);

  useEffect(() => { reload(); }, [reload]);

  const addAccountability = useCallback(async () => {
    if (!userId || !memberId) return;
    const { data } = await supabase
      .from('cos_person_accountabilities')
      .insert({ user_id: userId, member_id: memberId, text: '', sort_order: accountabilities.length })
      .select()
      .single();
    if (data) setAccountabilities(prev => [...prev, data]);
    return data ?? null;
  }, [userId, memberId, accountabilities.length]);

  const updateAccountability = useCallback(async (id: string, text: string) => {
    setAccountabilities(prev => prev.map(a => a.id === id ? { ...a, text } : a));
    await supabase.from('cos_person_accountabilities').update({ text }).eq('id', id);
  }, []);

  const deleteAccountability = useCallback(async (id: string) => {
    setAccountabilities(prev => prev.filter(a => a.id !== id));
    await supabase.from('cos_person_accountabilities').delete().eq('id', id);
  }, []);

  const addTopic = useCallback(async () => {
    if (!userId || !memberId) return;
    const { data } = await supabase
      .from('cos_person_topics')
      .insert({ user_id: userId, member_id: memberId, text: '', sort_order: topics.length })
      .select()
      .single();
    if (data) setTopics(prev => [...prev, data]);
    return data ?? null;
  }, [userId, memberId, topics.length]);

  const updateTopic = useCallback(async (id: string, updates: Partial<Pick<PersonTopic, 'text' | 'status' | 'flagged'>>) => {
    setTopics(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    await supabase.from('cos_person_topics').update(updates).eq('id', id);
  }, []);

  const deleteTopic = useCallback(async (id: string) => {
    setTopics(prev => prev.filter(t => t.id !== id));
    await supabase.from('cos_person_topics').delete().eq('id', id);
  }, []);

  return {
    accountabilities, topics, loading, reload,
    addAccountability, updateAccountability, deleteAccountability,
    addTopic, updateTopic, deleteTopic,
  };
}
