import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface UseRCDORealtimeProps {
  cycleId?: string;
  rallyingCryId?: string;
  doId?: string;
  onCycleUpdate?: () => void;
  onRallyingCryUpdate?: () => void;
  onDOUpdate?: () => void;
  onMetricsUpdate?: () => void;
  onInitiativesUpdate?: () => void;
  onLinksUpdate?: () => void;
  onCheckinsUpdate?: () => void;
}

/**
 * Real-time subscriptions for RCDO module
 * Subscribes to changes in cycles, rallying cries, DOs, metrics, initiatives, and links
 */
export function useRCDORealtime({
  cycleId,
  rallyingCryId,
  doId,
  onCycleUpdate,
  onRallyingCryUpdate,
  onDOUpdate,
  onMetricsUpdate,
  onInitiativesUpdate,
  onLinksUpdate,
  onCheckinsUpdate,
}: UseRCDORealtimeProps) {
  useEffect(() => {
    const channels: RealtimeChannel[] = [];

    // Subscribe to cycle updates
    if (cycleId && onCycleUpdate) {
      const cycleChannel = supabase
        .channel(`rc_cycle:${cycleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'rc_cycles',
            filter: `id=eq.${cycleId}`,
          },
          () => {
            onCycleUpdate();
          }
        )
        .subscribe();

      channels.push(cycleChannel);
    }

    // Subscribe to rallying cry updates
    if (rallyingCryId && onRallyingCryUpdate) {
      const rcChannel = supabase
        .channel(`rc_rallying_cry:${rallyingCryId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'rc_rallying_cries',
            filter: `id=eq.${rallyingCryId}`,
          },
          () => {
            onRallyingCryUpdate();
          }
        )
        .subscribe();

      channels.push(rcChannel);

      // Subscribe to DOs for this rallying cry
      if (onDOUpdate) {
        const dosChannel = supabase
          .channel(`rc_dos:${rallyingCryId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'rc_defining_objectives',
              filter: `rallying_cry_id=eq.${rallyingCryId}`,
            },
            () => {
              onDOUpdate();
            }
          )
          .subscribe();

        channels.push(dosChannel);
      }
    }

    // Subscribe to specific DO updates (metrics, initiatives, links)
    if (doId) {
      // Metrics updates
      if (onMetricsUpdate) {
        const metricsChannel = supabase
          .channel(`rc_metrics:${doId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'rc_do_metrics',
              filter: `defining_objective_id=eq.${doId}`,
            },
            () => {
              onMetricsUpdate();
            }
          )
          .subscribe();

        channels.push(metricsChannel);
      }

      // Initiatives updates
      if (onInitiativesUpdate) {
        const initiativesChannel = supabase
          .channel(`rc_initiatives:${doId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'rc_strategic_initiatives',
              filter: `defining_objective_id=eq.${doId}`,
            },
            () => {
              onInitiativesUpdate();
            }
          )
          .subscribe();

        channels.push(initiativesChannel);
      }

      // Links updates
      if (onLinksUpdate) {
        const linksChannel = supabase
          .channel(`rc_links:do:${doId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'rc_links',
              filter: `parent_id=eq.${doId}`,
            },
            () => {
              onLinksUpdate();
            }
          )
          .subscribe();

        channels.push(linksChannel);
      }

      // Check-ins updates
      if (onCheckinsUpdate) {
        const checkinsChannel = supabase
          .channel(`rc_checkins:do:${doId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'rc_checkins',
              filter: `parent_id=eq.${doId} AND parent_type=eq.do`,
            },
            () => {
              onCheckinsUpdate();
            }
          )
          .subscribe();

        channels.push(checkinsChannel);
      }
    }

    // Cleanup subscriptions on unmount
    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [
    cycleId,
    rallyingCryId,
    doId,
    onCycleUpdate,
    onRallyingCryUpdate,
    onDOUpdate,
    onMetricsUpdate,
    onInitiativesUpdate,
    onLinksUpdate,
    onCheckinsUpdate,
  ]);
}

/**
 * Simplified hook for Strategy Home page (company-wide)
 * Subscribes to cycle and all DOs updates
 */
export function useStrategyHomeRealtime(onUpdate: () => void) {
  useEffect(() => {
    const channels: RealtimeChannel[] = [];

    // Subscribe to all cycles (company-wide)
    const cyclesChannel = supabase
      .channel('rc_cycles:all')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rc_cycles',
        },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    channels.push(cyclesChannel);

    // Subscribe to rallying cries (will trigger when created/updated)
    const rcChannel = supabase
      .channel('rc_rallying_cries:all')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rc_rallying_cries',
        },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    channels.push(rcChannel);

    // Subscribe to all DOs (health changes, etc.)
    const dosChannel = supabase
      .channel('rc_dos:all')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rc_defining_objectives',
        },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    channels.push(dosChannel);

    // Cleanup
    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [onUpdate]);
}

