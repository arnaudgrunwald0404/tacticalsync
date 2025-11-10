import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface UseRealtimeSubscriptionOptions<T = any> {
  table: string;
  filter?: string;
  onInsert?: (payload: RealtimePostgresChangesPayload<T>) => void;
  onUpdate?: (payload: RealtimePostgresChangesPayload<T>) => void;
  onDelete?: (payload: RealtimePostgresChangesPayload<T>) => void;
  enabled?: boolean;
}

/**
 * Hook to subscribe to real-time database changes from Supabase
 * Automatically handles cleanup and reconnection
 */
export function useRealtimeSubscription<T = any>({
  table,
  filter,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseRealtimeSubscriptionOptions<T>) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const setupSubscription = useCallback(() => {
    if (!enabled) return;

    // Clean up existing subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Create channel name with filter for uniqueness
    const channelName = filter 
      ? `${table}:${filter.replace(/=/g, '_').replace(/\./g, '_')}`
      : `${table}:all`;

    // Create new channel
    const channel = supabase.channel(channelName);

    // Build the subscription query
    let subscriptionQuery = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: table,
        ...(filter && { filter }),
      },
      (payload) => {
        console.log(`[Realtime] ${table} change:`, payload);
        
        switch (payload.eventType) {
          case 'INSERT':
            onInsert?.(payload as RealtimePostgresChangesPayload<T>);
            break;
          case 'UPDATE':
            onUpdate?.(payload as RealtimePostgresChangesPayload<T>);
            break;
          case 'DELETE':
            onDelete?.(payload as RealtimePostgresChangesPayload<T>);
            break;
        }
      }
    );

    // Subscribe to the channel
    subscriptionQuery.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[Realtime] Subscribed to ${table}${filter ? ` (${filter})` : ''}`);
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`[Realtime] Channel error for ${table}:`, err);
        // Attempt to reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`[Realtime] Attempting to reconnect to ${table}...`);
          setupSubscription();
        }, 5000);
      } else if (status === 'TIMED_OUT') {
        console.error(`[Realtime] Connection timed out for ${table}`);
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`[Realtime] Attempting to reconnect to ${table}...`);
          setupSubscription();
        }, 3000);
      }
    });

    channelRef.current = channel;
  }, [table, filter, onInsert, onUpdate, onDelete, enabled]);

  useEffect(() => {
    setupSubscription();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [setupSubscription]);

  return {
    channel: channelRef.current,
  };
}

