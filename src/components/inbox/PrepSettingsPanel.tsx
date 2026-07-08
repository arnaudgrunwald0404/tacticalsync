import { useEffect, useState } from 'react';
import { Loader2, Check, Bot, Brain, Sparkles, Wrench } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { STATIC_TOOLS, buildStackOneTools, STACKONE_PROVIDER_CATALOG, type PrepToolDef } from '@/lib/prepTools';

interface PrepSettingsPanelProps {
  memberId: string;
  memberName: string;
  contextNotes: string | null;
}

export function PrepSettingsPanel({ memberId, memberName, contextNotes }: PrepSettingsPanelProps) {
  return (
    <div className="max-w-[680px] flex flex-col gap-4">
      <AgentToggles memberId={memberId} memberName={memberName} />
      <PrepToolsCard memberId={memberId} />
      <ContextCard memberId={memberId} memberName={memberName} initialValue={contextNotes ?? ''} />
      <PrepInstructionsCard />
    </div>
  );
}

// ── Shared card shell + section header, matching the Inbox meeting panel style ──

function SettingsCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-white rounded-xl border border-gray-200/80 shadow-sm p-4', className)}>{children}</div>;
}

function SecHdr({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-gray-400" />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium text-gray-800">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ── Agent toggles ────────────────────────────────────────────────────────────

function AgentToggles({ memberId, memberName }: { memberId: string; memberName: string }) {
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('cos_team_members')
        .select('agent_overrides')
        .eq('id', memberId)
        .single();
      if (cancelled) return;
      setOverrides((data?.agent_overrides ?? {}) as Record<string, unknown>);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [memberId]);

  const update = async (patch: Record<string, unknown>) => {
    const next = { ...overrides, ...patch };
    setOverrides(next);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_team_members').update({ agent_overrides: next }).eq('id', memberId);
  };

  return (
    <SettingsCard className="px-[22px] py-5 flex flex-col gap-4">
      <div>
        <div className="text-[13.5px] font-bold text-gray-800 flex items-center gap-2"><Bot className="h-[17px] w-[17px] text-gray-400" />Agent for {memberName}</div>
        <div className="text-[12.5px] text-gray-400 mt-0.5">How your agent prepares and follows up between 1:1s.</div>
      </div>
      <ToggleRow label="Auto-generate prep" description="Draft a new prep before each 1:1"
        checked={loaded ? overrides.auto_prep !== false : true} onChange={v => update({ auto_prep: v })} />
      <ToggleRow label="Nudge on open actions" description={`Remind ${memberName} as due dates approach`}
        checked={loaded ? overrides.nudge_actions !== false : true} onChange={v => update({ nudge_actions: v })} />
    </SettingsCard>
  );
}

// ── Tools for this 1:1 ───────────────────────────────────────────────────────

function PrepToolsCard({ memberId }: { memberId: string }) {
  const { toast } = useToast();
  const [perMemberTools, setPerMemberTools] = useState<string[] | null>(null);
  const [globalTools, setGlobalTools] = useState<string[]>([]);
  const [availableTools, setAvailableTools] = useState<PrepToolDef[]>(STATIC_TOOLS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user || cancelled) return;
        const userId = userData.user.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any;

        const [memberRes, scheduleRes, stackoneRes, mcpRes] = await Promise.all([
          db.from('cos_team_members').select('agent_overrides').eq('id', memberId).single(),
          db.from('cos_prep_schedule').select('prep_tools').eq('user_id', userId).maybeSingle(),
          supabase.functions.invoke('stackone-proxy', { body: { action: 'list_accounts' } }),
          db.from('cos_mcp_integrations').select('integration_key, is_connected').eq('user_id', userId).eq('integration_key', 'cleargo').eq('is_connected', true).maybeSingle(),
        ]);

        if (cancelled) return;

        const overrides = (memberRes.data?.agent_overrides ?? {}) as Record<string, unknown>;
        const memberToolOverride = Array.isArray(overrides.prep_tools) ? overrides.prep_tools as string[] : null;
        const globalDefault = Array.isArray(scheduleRes.data?.prep_tools) ? scheduleRes.data.prep_tools as string[] : ['zoom', 'slack'];

        const accounts = (stackoneRes.data?.accounts ?? []) as Array<{ provider: string; provider_name?: string; status?: string }>;
        const dynamicTools = buildStackOneTools(accounts);
        if (mcpRes.data && !dynamicTools.some(t => t.id === 'cleargo')) {
          const known = STACKONE_PROVIDER_CATALOG.cleargo;
          dynamicTools.push({ id: 'cleargo', label: known.label, description: known.description, defaultTier: known.defaultTier, isCore: known.isCore });
        }

        setPerMemberTools(memberToolOverride);
        setGlobalTools(globalDefault);
        setAvailableTools([...STATIC_TOOLS, ...dynamicTools]);
      } catch {
        // leave defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [memberId]);

  const effectiveTools = perMemberTools ?? globalTools;
  const isUsingGlobalDefault = perMemberTools === null;

  const toggleTool = async (toolId: string) => {
    const current = effectiveTools;
    const next = current.includes(toolId)
      ? current.filter(t => t !== toolId)
      : [...current, toolId];
    setPerMemberTools(next);
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from('cos_team_members').select('agent_overrides').eq('id', memberId).single();
      const overrides = (data?.agent_overrides ?? {}) as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('cos_team_members')
        .update({ agent_overrides: { ...overrides, prep_tools: next } }).eq('id', memberId);
    } catch (err) {
      setPerMemberTools(perMemberTools);
      toast({ title: 'Could not update tools', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const resetToGlobal = async () => {
    setPerMemberTools(null);
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from('cos_team_members').select('agent_overrides').eq('id', memberId).single();
      const overrides = (data?.agent_overrides ?? {}) as Record<string, unknown>;
      const next = { ...overrides };
      delete next.prep_tools;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('cos_team_members').update({ agent_overrides: next }).eq('id', memberId);
    } catch (err) {
      toast({ title: 'Could not reset tools', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard className="px-[18px] py-4">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-gray-400 flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5" />Tools for this 1:1
        </div>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {availableTools.map(t => {
              const on = effectiveTools.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTool(t.id)}
                  disabled={saving}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs border transition-colors whitespace-nowrap disabled:opacity-60',
                    on
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {!isUsingGlobalDefault && (
            <button
              onClick={resetToGlobal}
              disabled={saving}
              className="mt-2.5 text-[11px] text-gray-400 hover:text-gray-700 underline-offset-2 hover:underline disabled:opacity-50"
            >
              Reset to global default
            </button>
          )}
          {isUsingGlobalDefault && (
            <p className="mt-2 text-[11px] text-gray-400">Using your global default — click to customize for this person.</p>
          )}
        </>
      )}
    </SettingsCard>
  );
}

// ── Context about this person ────────────────────────────────────────────────

function ContextCard({ memberId, memberName, initialValue }: { memberId: string; memberName: string; initialValue: string }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(initialValue);
  const [baseline, setBaseline] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('cos_team_members')
        .update({ context_notes: draft || null })
        .eq('id', memberId);
      if (error) throw error;
      setBaseline(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      toast({ title: 'Failed to save context', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard className="px-[22px] py-5">
      <SecHdr icon={Brain} label={`Context about ${memberName}`} />
      <p className="text-[12.5px] text-gray-400 mt-1 mb-3">Appended to every future prep so your agent stays grounded.</p>
      <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4}
        placeholder={`e.g. ${memberName} cares about shipping quality over speed. Prefers async written updates.`}
        className="text-[13.5px] leading-[1.55] resize-y" />
      <div className="flex items-center gap-3 mt-3">
        <Button size="sm" variant="secondary" onClick={save} disabled={saving || draft === baseline}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}Save context
        </Button>
        {saved && <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" />Saved</span>}
      </div>
    </SettingsCard>
  );
}

// ── Prep instructions (global, applies to every 1:1) ─────────────────────────

function PrepInstructionsCard() {
  const { toast } = useToast();
  const [draft, setDraft] = useState('');
  const [baseline, setBaseline] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('cos_prep_settings')
      .select('prep_instructions')
      .single()
      .then(({ data }: { data: { prep_instructions: string } | null }) => {
        if (cancelled) return;
        setDraft(data?.prep_instructions ?? '');
        setBaseline(data?.prep_instructions ?? '');
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('cos_prep_settings')
        .upsert({ user_id: user.id, prep_instructions: draft }, { onConflict: 'user_id' });
      if (error) throw error;
      setBaseline(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      toast({ title: 'Failed to save instructions', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard className="px-[22px] py-5">
      <SecHdr icon={Sparkles} label="Prep instructions" />
      <p className="text-[12.5px] text-gray-400 mt-1 mb-3">Your agent follows these every time it drafts a prep — applies across all your 1:1s.</p>
      <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4} disabled={!loaded}
        placeholder="e.g. Always highlight blockers first. Don't repeat unchanged items. Keep it terse."
        className="text-[13.5px] leading-[1.55] resize-y" />
      <div className="flex items-center gap-3 mt-3">
        <Button size="sm" variant="secondary" onClick={save} disabled={saving || draft === baseline}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}Save instructions
        </Button>
        {saved && <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" />Saved</span>}
      </div>
    </SettingsCard>
  );
}
