import { useCallback } from 'react';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface UseMeetingRealtimeOptions {
  meetingId?: string;
  seriesId?: string;
  teamId?: string;
  onPriorityChange?: () => void;
  onTopicChange?: () => void;
  onActionItemChange?: () => void;
  onAgendaChange?: () => void;
  enabled?: boolean;
}

/**
 * Hook to subscribe to real-time changes for all meeting-related data
 * Handles priorities, topics, action items, and agenda items
 */
export function useMeetingRealtime({
  meetingId,
  seriesId,
  teamId,
  onPriorityChange,
  onTopicChange,
  onActionItemChange,
  onAgendaChange,
  enabled = true,
}: UseMeetingRealtimeOptions) {

  // Priorities subscription
  useRealtimeSubscription({
    table: 'meeting_instance_priorities',
    filter: meetingId ? `instance_id=eq.${meetingId}` : undefined,
    onInsert: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Priority added:', payload.new);
      onPriorityChange?.();
    }, [onPriorityChange]),
    onUpdate: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Priority updated:', payload.new);
      onPriorityChange?.();
    }, [onPriorityChange]),
    onDelete: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Priority deleted:', payload.old);
      onPriorityChange?.();
    }, [onPriorityChange]),
    enabled: enabled && !!meetingId,
  });

  // Topics subscription
  useRealtimeSubscription({
    table: 'meeting_instance_topics',
    filter: meetingId ? `instance_id=eq.${meetingId}` : undefined,
    onInsert: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Topic added:', payload.new);
      onTopicChange?.();
    }, [onTopicChange]),
    onUpdate: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Topic updated:', payload.new);
      onTopicChange?.();
    }, [onTopicChange]),
    onDelete: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Topic deleted:', payload.old);
      onTopicChange?.();
    }, [onTopicChange]),
    enabled: enabled && !!meetingId,
  });

  // Action items subscription
  useRealtimeSubscription({
    table: 'meeting_series_action_items',
    filter: seriesId ? `series_id=eq.${seriesId}` : undefined,
    onInsert: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Action item added:', payload.new);
      onActionItemChange?.();
    }, [onActionItemChange]),
    onUpdate: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Action item updated:', payload.new);
      onActionItemChange?.();
    }, [onActionItemChange]),
    onDelete: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Action item deleted:', payload.old);
      onActionItemChange?.();
    }, [onActionItemChange]),
    enabled: enabled && !!seriesId,
  });

  // Agenda items subscription
  useRealtimeSubscription({
    table: 'meeting_series_agenda',
    filter: seriesId ? `series_id=eq.${seriesId}` : undefined,
    onInsert: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Agenda item added:', payload.new);
      onAgendaChange?.();
    }, [onAgendaChange]),
    onUpdate: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Agenda item updated:', payload.new);
      onAgendaChange?.();
    }, [onAgendaChange]),
    onDelete: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Agenda item deleted:', payload.old);
      onAgendaChange?.();
    }, [onAgendaChange]),
    enabled: enabled && !!seriesId,
  });
}

