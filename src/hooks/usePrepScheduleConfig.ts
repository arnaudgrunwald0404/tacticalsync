import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// Re-export the pure time helpers so callers can import them alongside the hook.
export { getBrowserTimezone, isValidTimezone, formatHourLabel } from '@/lib/prepScheduleTime';

/**
 * Single source of truth for the `cos_prep_schedule` row.
 *
 * The Prep schedule panel, the onboarding wizard, and the dashboard banner all
 * read and write the same row. Previously each kept its own copy of the
 * read/save/time-conversion logic, so they drifted. This hook centralises that
 * so a fix lands everywhere at once.
 *
 * The table is not in the generated Supabase types, so the single `as any` cast
 * lives here — callers get the typed `PrepScheduleConfig` instead.
 */

export interface PrepScheduleConfig {
  // Product A — Recurring Meeting Prep
  enabled: boolean;
  always_include: string[];
  max_others_after_exclude: number;
  included_group_series: string[];
  prep_tools: string[];
  tool_tiers: Record<string, number>;
  sync_zoom_before: boolean;
  sync_slack_before: boolean;
  enrich_stackone: boolean;
  slack_channels: string[];
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_preps_generated: number | null;
  // Product B — My Daily Brief (DCI)
  dci_enabled: boolean;
  dci_sources: string[];
  dci_instructions: string | null;
  dci_slack_dm: boolean;
  slack_user_id: string | null;
  dci_last_run_at: string | null;
  dci_last_run_status: string | null;
  // Shared schedule
  run_hour_local: number;
  timezone: string;
}

export const DEFAULT_PREP_SCHEDULE: PrepScheduleConfig = {
  enabled: false,
  always_include: [],
  max_others_after_exclude: 1,
  included_group_series: [],
  prep_tools: ['zoom', 'slack'],
  tool_tiers: {},
  sync_zoom_before: true,
  sync_slack_before: true,
  enrich_stackone: false,
  slack_channels: [],
  last_run_at: null,
  last_run_status: null,
  last_run_preps_generated: null,
  dci_enabled: false,
  dci_sources: ['calendar', 'zoom', 'slack'],
  dci_instructions: null,
  dci_slack_dm: true,
  slack_user_id: null,
  dci_last_run_at: null,
  dci_last_run_status: null,
  run_hour_local: 8,
  timezone: 'UTC',
};

// ── Hook ─────────────────────────────────────────────────────────────────────

function mapRow(data: Record<string, unknown> | null): PrepScheduleConfig {
  if (!data) return { ...DEFAULT_PREP_SCHEDULE };
  const d = DEFAULT_PREP_SCHEDULE;
  return {
    enabled: (data.enabled as boolean) ?? d.enabled,
    always_include: (data.always_include as string[]) ?? d.always_include,
    max_others_after_exclude: (data.max_others_after_exclude as number) ?? d.max_others_after_exclude,
    included_group_series: (data.included_group_series as string[]) ?? d.included_group_series,
    prep_tools: (data.prep_tools as string[]) ?? d.prep_tools,
    tool_tiers: (data.tool_tiers as Record<string, number>) ?? d.tool_tiers,
    sync_zoom_before: (data.sync_zoom_before as boolean) ?? d.sync_zoom_before,
    sync_slack_before: (data.sync_slack_before as boolean) ?? d.sync_slack_before,
    enrich_stackone: (data.enrich_stackone as boolean) ?? d.enrich_stackone,
    slack_channels: (data.slack_channels as string[]) ?? d.slack_channels,
    last_run_at: (data.last_run_at as string) ?? null,
    last_run_status: (data.last_run_status as string) ?? null,
    last_run_preps_generated: (data.last_run_preps_generated as number) ?? null,
    dci_enabled: (data.dci_enabled as boolean) ?? d.dci_enabled,
    dci_sources: (data.dci_sources as string[]) ?? d.dci_sources,
    dci_instructions: (data.dci_instructions as string) ?? null,
    dci_slack_dm: (data.dci_slack_dm as boolean) ?? d.dci_slack_dm,
    slack_user_id: (data.slack_user_id as string) ?? null,
    dci_last_run_at: (data.dci_last_run_at as string) ?? null,
    dci_last_run_status: (data.dci_last_run_status as string) ?? null,
    // run_hour_local supersedes the deprecated run_hour_utc; fall back for old rows.
    run_hour_local: (data.run_hour_local as number) ?? (data.run_hour_utc as number) ?? d.run_hour_local,
    timezone: (data.timezone as string) || d.timezone,
  };
}

export function usePrepScheduleConfig() {
  const { toast } = useToast();
  const [config, setConfig] = useState<PrepScheduleConfig | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setConfig({ ...DEFAULT_PREP_SCHEDULE });
        return;
      }
      setUserId(user.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: fetchError } = await (supabase as any)
        .from('cos_prep_schedule')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      setConfig(mapRow(data));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load prep schedule';
      setError(message);
      setConfig({ ...DEFAULT_PREP_SCHEDULE });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  /**
   * Upsert a partial config. Only the provided fields are written, so callers
   * can safely save just their own product's settings without clobbering the
   * other's. Updates local state on success and returns whether it succeeded.
   */
  const saveConfig = useCallback(async (updates: Partial<PrepScheduleConfig>): Promise<boolean> => {
    try {
      let uid = userId;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id ?? null;
        setUserId(uid);
      }
      if (!uid) throw new Error('Not authenticated');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: saveError } = await (supabase as any)
        .from('cos_prep_schedule')
        .upsert(
          { user_id: uid, ...updates, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
      if (saveError) throw saveError;
      setConfig(prev => ({ ...(prev ?? DEFAULT_PREP_SCHEDULE), ...updates }));
      return true;
    } catch (err) {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
      return false;
    }
  }, [userId, toast]);

  return { config, userId, loading, error, refetch: fetchConfig, saveConfig };
}
