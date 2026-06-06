import { useEffect, useMemo, useState } from 'react';
import { addDays, format, startOfDay } from 'date-fns';
import { Loader2, Sun, PartyPopper, Send, ImageIcon, X, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

const ART_STYLES = [
  'Monochrome', 'Color block', 'Runway', 'Risograph', 'Technicolor',
  'Gothic clay', 'Dynamite', 'Salon', 'Sketch', 'Cinematic', 'Steampunk', 'Sunrise',
] as const;

interface WeekendVibes {
  id: string;
  week_of: string;
  friday_prompt: string | null;
  art_style: string | null;
  image_url: string | null;
  monday_reflection: string | null;
}

function getWeekendContext(): { isFriday: boolean; isMonday: boolean; weekOf: string } {
  const now = new Date();
  const day = now.getDay();
  const isFriday = day === 5;
  const isMonday = day === 1;
  let mondayDate: Date;
  if (isFriday) {
    mondayDate = addDays(now, 3);
  } else if (isMonday) {
    mondayDate = now;
  } else {
    const daysUntilMonday = ((8 - day) % 7) || 7;
    mondayDate = addDays(now, daysUntilMonday);
  }
  const weekOf = format(startOfDay(mondayDate), 'yyyy-MM-dd');
  return { isFriday, isMonday, weekOf };
}

export function WeekendBanner() {
  const forceDay = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('banner_day') as 'friday' | 'monday' | null;
  }, []);
  const realCtx = useMemo(getWeekendContext, []);
  const isFriday = forceDay === 'friday' || (!forceDay && realCtx.isFriday);
  const isMonday = forceDay === 'monday' || (!forceDay && realCtx.isMonday);
  const weekOf = realCtx.weekOf;

  const [vibes, setVibes] = useState<WeekendVibes | null>(null);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    console.log('[WeekendBanner]', {
      today: format(new Date(), 'EEEE yyyy-MM-dd'),
      realIsFriday: realCtx.isFriday,
      realIsMonday: realCtx.isMonday,
      forceDay,
      effectiveIsFriday: isFriday,
      effectiveIsMonday: isMonday,
      weekOf,
      hint: !isFriday && !isMonday
        ? 'Banner hidden — add ?banner_day=friday or ?banner_day=monday to URL to force-show'
        : 'Banner will render',
    });
  }, [realCtx, forceDay, isFriday, isMonday, weekOf]);

  useEffect(() => {
    if (!isFriday && !isMonday) { setLoaded(true); return; }
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoaded(true); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('cos_weekend_vibes')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_of', weekOf)
        .maybeSingle();
      if (error) {
        console.error('[WeekendBanner] Failed to load vibes:', error.message, '— table may not exist (migration 20260610000000)');
      }
      if (data) setVibes(data as WeekendVibes);
      setLoaded(true);
    }
    load();
  }, [isFriday, isMonday, weekOf]);

  const [genError, setGenError] = useState<string | null>(null);

  const handleGenerate = async (styleOverride?: string) => {
    const prompt = styleOverride ? (vibes?.friday_prompt ?? input.trim()) : input.trim();
    if (!prompt || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const payload: Record<string, string> = { prompt, week_of: weekOf };
      if (styleOverride) payload.art_style = styleOverride;
      console.log('[WeekendBanner] Calling generate-weekend-banner', payload);
      const res = await supabase.functions.invoke('generate-weekend-banner', {
        body: payload,
      });
      console.log('[WeekendBanner] Response:', { error: res.error, data: res.data });
      if (res.error) {
        let detail = '';
        try {
          const ctx = (res.error as any).context;
          if (ctx?.json) detail = JSON.stringify(await ctx.json());
          else if (ctx?.text) detail = await ctx.text();
        } catch { /* ignore */ }
        console.error('[WeekendBanner] Error body:', detail || '(no body)');
        throw new Error(detail || res.error.message || String(res.error));
      }
      if (res.data?.error) {
        throw new Error(`${res.data.error}${res.data.detail ? ': ' + res.data.detail : ''}`);
      }
      const data = res.data as { image_url: string; art_style: string; friday_prompt: string; week_of: string };
      if (!data.image_url) {
        throw new Error('No image_url in response: ' + JSON.stringify(data));
      }
      // Append cache-buster so the browser re-fetches when the same storage path is overwritten
      const bustUrl = data.image_url + (data.image_url.includes('?') ? '&' : '?') + 't=' + Date.now();
      setVibes({
        id: '',
        week_of: data.week_of,
        friday_prompt: data.friday_prompt,
        art_style: data.art_style,
        image_url: bustUrl,
        monday_reflection: null,
      });
      setInput('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[WeekendBanner] Generation failed:', msg, err);
      setGenError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleReflection = async () => {
    if (!input.trim() || saving) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('cos_weekend_vibes')
        .update({ monday_reflection: input.trim(), updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('week_of', weekOf);
      setVibes(prev => prev ? { ...prev, monday_reflection: input.trim() } : prev);
      setInput('');
    } catch (err) {
      console.error('Reflection save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded || dismissed || (!isFriday && !isMonday)) return null;

  if (isFriday) {
    return (
      <div className="container mx-auto px-6 max-w-7xl pt-6">
        <section className="rounded-2xl overflow-hidden">
          {vibes?.image_url ? (
            <div className="relative">
              <img
                src={vibes.image_url}
                alt={vibes.friday_prompt ?? 'Weekend vibes'}
                className="w-full h-56 object-cover rounded-2xl"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent rounded-2xl" />
              <button
                onClick={() => setDismissed(true)}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 text-white/70 hover:text-white hover:bg-black/50 transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="absolute bottom-5 left-6 right-6">
                <h2 className="font-heading font-extrabold text-3xl tracking-tight text-white drop-shadow-lg">
                  Happy Friday!
                </h2>
                <p className="text-white/85 text-base font-medium mt-1 drop-shadow">
                  {vibes.friday_prompt}
                </p>
                {vibes.art_style && (
                  <button
                    onClick={() => {
                      const idx = ART_STYLES.indexOf(vibes.art_style as typeof ART_STYLES[number]);
                      const next = ART_STYLES[(idx + 1) % ART_STYLES.length];
                      handleGenerate(next);
                    }}
                    disabled={generating}
                    className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-bold uppercase tracking-wider text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
                    title="Click to regenerate in a different style"
                  >
                    {generating
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <RefreshCw className="h-3 w-3" />
                    }
                    {vibes.art_style}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              className="relative p-6 rounded-2xl text-white"
              style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ef4444 100%)' }}
            >
              <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{ background: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.15), transparent 50%)' }} />
              <button
                onClick={() => setDismissed(true)}
                className="absolute top-3 right-3 p-1 text-white/50 hover:text-white transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="relative">
                <div className="flex items-center gap-3 mb-2">
                  <PartyPopper className="h-6 w-6" />
                  <h2 className="font-heading font-extrabold text-2xl tracking-tight">Happy Friday!</h2>
                </div>
                <p className="text-white/80 text-sm mb-4">
                  What are you up to this weekend?
                </p>
                <div className="relative">
                  <Input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }}
                    placeholder="Beach day, hiking, catching up on reading..."
                    disabled={generating}
                    className="bg-white/30 border-white/40 text-white font-medium placeholder:text-white/60 pr-10 h-10 focus-visible:ring-white/40"
                  />
                  <button
                    onClick={() => handleGenerate()}
                    disabled={generating || !input.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/70 hover:text-white disabled:opacity-40 transition-colors"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
                {generating && (
                  <p className="text-[11px] text-white/60 mt-2 animate-pulse">
                    Generating your weekend banner...
                  </p>
                )}
                {genError && (
                  <p className="text-[11px] text-red-200 bg-red-900/40 rounded px-2 py-1 mt-2">
                    {genError}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  if (isMonday && vibes?.image_url) {
    const hasReflection = !!vibes.monday_reflection;
    return (
      <div className="container mx-auto px-6 max-w-7xl pt-6">
        <section className="rounded-2xl overflow-hidden">
          <div className="relative">
            <img
              src={vibes.image_url}
              alt={vibes.friday_prompt ?? 'Weekend vibes'}
              className="w-full h-56 object-cover rounded-2xl"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent rounded-2xl" />
            <button
              onClick={() => setDismissed(true)}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 text-white/70 hover:text-white hover:bg-black/50 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 p-5 px-6">
              {hasReflection ? (
                <div>
                  <p className="text-white/50 text-xs font-bold uppercase tracking-wider mb-1">Weekend reflection</p>
                  <p className="text-white text-base font-medium drop-shadow">{vibes.monday_reflection}</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <Sun className="h-6 w-6 text-amber-300" />
                    <p className="text-white font-heading font-extrabold text-2xl tracking-tight drop-shadow-lg">
                      How was your weekend?
                    </p>
                  </div>
                  <div className="relative max-w-lg">
                    <Input
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleReflection(); }}
                      placeholder="It was great! I..."
                      disabled={saving}
                      className="bg-white/30 border-white/40 text-white font-medium placeholder:text-white/60 pr-10 h-11 text-base focus-visible:ring-white/40"
                    />
                    <button
                      onClick={handleReflection}
                      disabled={saving || !input.trim()}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white disabled:opacity-40 transition-colors"
                    >
                      {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return null;
}
