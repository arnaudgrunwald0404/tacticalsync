import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

export type TopicCategory =
  | 'blocker' | 'escalation' | 'project' | 'goal'
  | 'feedback' | 'development' | 'personal' | 'general';

export type TopicSentiment = 'positive' | 'negative' | 'neutral' | 'mixed';

export type TopicStatus = 'active' | 'resolved' | 'stale' | 'recurring';

export interface RelationshipTopic {
  id: string;
  user_id: string;
  team_member_id: string;
  prep_id: string | null;
  topic: string;
  category: TopicCategory;
  sentiment: TopicSentiment;
  first_mentioned_at: string;
  last_mentioned_at: string;
  mention_count: number;
  status: TopicStatus;
  resolved_at: string | null;
  context_snippet: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForgottenCommitment {
  id: string;
  user_id: string;
  member_id: string;
  text: string;
  due_date: string | null;
  created_at: string;
  surface_count: number;
  days_pending: number;
  urgency: 'critical' | 'warning' | 'normal';
}

// ── useRelationshipTopics ──────────────────────────────────────────────────────

export function useRelationshipTopics(teamMemberId: string | null) {
  const [topics, setTopics] = useState<RelationshipTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchTopics = useCallback(async () => {
    if (!teamMemberId) {
      setTopics([]);
      return;
    }
    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data, error } = await supabase
        .from('cos_relationship_topics')
        .select('*')
        .eq('user_id', userData.user.id)
        .eq('team_member_id', teamMemberId)
        .order('last_mentioned_at', { ascending: false });

      if (error) throw error;
      setTopics((data ?? []) as RelationshipTopic[]);
    } catch (err) {
      console.error('Failed to fetch relationship topics:', err);
    } finally {
      setLoading(false);
    }
  }, [teamMemberId]);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);

  const updateTopicStatus = useCallback(async (topicId: string, status: TopicStatus) => {
    try {
      const updates: Record<string, unknown> = { status };
      if (status === 'resolved') {
        updates.resolved_at = new Date().toISOString();
      } else {
        updates.resolved_at = null;
      }

      const { error } = await supabase
        .from('cos_relationship_topics')
        .update(updates)
        .eq('id', topicId);

      if (error) throw error;

      setTopics(prev =>
        prev.map(t =>
          t.id === topicId
            ? { ...t, status, resolved_at: status === 'resolved' ? new Date().toISOString() : null }
            : t
        )
      );
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  }, [toast]);

  return { topics, loading, refetch: fetchTopics, updateTopicStatus };
}

// ── useForgottenCommitments ────────────────────────────────────────────────────

export function useForgottenCommitments(teamMemberId: string | null) {
  const [commitments, setCommitments] = useState<ForgottenCommitment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCommitments = useCallback(async () => {
    if (!teamMemberId) {
      setCommitments([]);
      return;
    }
    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data, error } = await supabase
        .from('cos_forgotten_commitments')
        .select('*')
        .eq('user_id', userData.user.id)
        .eq('member_id', teamMemberId)
        .order('days_pending', { ascending: false });

      if (error) throw error;
      setCommitments((data ?? []) as ForgottenCommitment[]);
    } catch (err) {
      console.error('Failed to fetch forgotten commitments:', err);
    } finally {
      setLoading(false);
    }
  }, [teamMemberId]);

  useEffect(() => { fetchCommitments(); }, [fetchCommitments]);

  return { commitments, loading, refetch: fetchCommitments };
}
