import { useCallback } from 'react';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';

interface UseMeetingRealtimeOptions {
  meetingId?: string;
  seriesId?: string;
  teamId?: string;
  onPriorityChange?: () => void;
  onTopicChange?: () => void;
  onActionItemChange?: () => void;
  onAgendaChange?: () => void;
  showNotifications?: boolean;
  currentUserId?: string;
  enabled?: boolean;
}

/**
 * Enhanced version of useMeetingRealtime with toast notifications
 * Shows notifications when other users make changes
 */
export function useMeetingRealtimeWithNotifications({
  meetingId,
  seriesId,
  teamId,
  onPriorityChange,
  onTopicChange,
  onActionItemChange,
  onAgendaChange,
  showNotifications = true,
  currentUserId,
  enabled = true,
}: UseMeetingRealtimeOptions) {
  const { toast } = useToast();

  const showUpdateNotification = useCallback((type: string, action: string, userId?: string) => {
    // Don't show notifications for current user's own changes
    if (userId === currentUserId) return;
    
    if (showNotifications) {
      toast({
        title: 'Real-time Update',
        description: `${type} ${action} by another team member`,
        duration: 3000,
      });
    }
  }, [showNotifications, toast, currentUserId]);

  // Priorities subscription
  useRealtimeSubscription({
    table: 'meeting_instance_priorities',
    filter: meetingId ? `instance_id=eq.${meetingId}` : undefined,
    onInsert: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Priority added:', payload.new);
      showUpdateNotification('Priority', 'added', payload.new.created_by);
      onPriorityChange?.();
    }, [onPriorityChange, showUpdateNotification]),
    onUpdate: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Priority updated:', payload.new);
      showUpdateNotification('Priority', 'updated', payload.new.created_by);
      onPriorityChange?.();
    }, [onPriorityChange, showUpdateNotification]),
    onDelete: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Priority deleted:', payload.old);
      showUpdateNotification('Priority', 'deleted');
      onPriorityChange?.();
    }, [onPriorityChange, showUpdateNotification]),
    enabled: enabled && !!meetingId,
  });

  // Topics subscription
  useRealtimeSubscription({
    table: 'meeting_instance_topics',
    filter: meetingId ? `instance_id=eq.${meetingId}` : undefined,
    onInsert: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Topic added:', payload.new);
      showUpdateNotification('Topic', 'added', payload.new.created_by);
      onTopicChange?.();
    }, [onTopicChange, showUpdateNotification]),
    onUpdate: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Topic updated:', payload.new);
      showUpdateNotification('Topic', 'updated', payload.new.created_by);
      onTopicChange?.();
    }, [onTopicChange, showUpdateNotification]),
    onDelete: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Topic deleted:', payload.old);
      showUpdateNotification('Topic', 'deleted');
      onTopicChange?.();
    }, [onTopicChange, showUpdateNotification]),
    enabled: enabled && !!meetingId,
  });

  // Action items subscription
  useRealtimeSubscription({
    table: 'meeting_series_action_items',
    filter: seriesId ? `series_id=eq.${seriesId}` : undefined,
    onInsert: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Action item added:', payload.new);
      showUpdateNotification('Action item', 'added', payload.new.created_by);
      onActionItemChange?.();
    }, [onActionItemChange, showUpdateNotification]),
    onUpdate: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Action item updated:', payload.new);
      showUpdateNotification('Action item', 'updated', payload.new.created_by);
      onActionItemChange?.();
    }, [onActionItemChange, showUpdateNotification]),
    onDelete: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Action item deleted:', payload.old);
      showUpdateNotification('Action item', 'deleted');
      onActionItemChange?.();
    }, [onActionItemChange, showUpdateNotification]),
    enabled: enabled && !!seriesId,
  });

  // Agenda items subscription
  useRealtimeSubscription({
    table: 'meeting_series_agenda',
    filter: seriesId ? `series_id=eq.${seriesId}` : undefined,
    onInsert: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Agenda item added:', payload.new);
      showUpdateNotification('Agenda item', 'added', payload.new.created_by);
      onAgendaChange?.();
    }, [onAgendaChange, showUpdateNotification]),
    onUpdate: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Agenda item updated:', payload.new);
      showUpdateNotification('Agenda item', 'updated', payload.new.created_by);
      onAgendaChange?.();
    }, [onAgendaChange, showUpdateNotification]),
    onDelete: useCallback((payload: RealtimePostgresChangesPayload<any>) => {
      console.log('[Realtime] Agenda item deleted:', payload.old);
      showUpdateNotification('Agenda item', 'deleted');
      onAgendaChange?.();
    }, [onAgendaChange, showUpdateNotification]),
    enabled: enabled && !!seriesId,
  });
}

