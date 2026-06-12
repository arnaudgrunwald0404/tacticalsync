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

type BannerMode = 'friday' | 'saturday' | 'sunday' | 'monday' | 'none';

const DAY_HEADINGS: Record<BannerMode, string> = {
  friday: 'Happy Friday!',
  saturday: 'Happy Saturday!',
  sunday: 'Happy Sunday!',
  monday: '',
  none: '',
};

function getWeekendContext(): { mode: BannerMode; weekOf: string } {
  const now = new Date();
  const day = now.getDay();
  let mode: BannerMode;
  if (day === 5) mode = 'friday';
  else if (day === 6) mode = 'saturday';
  else if (day === 0) mode = 'sunday';
  else if (day === 1) mode = 'monday';
  else mode = 'none';

  let mondayDate: Date;
  if (day === 5) mondayDate = addDays(now, 3);
  else if (day === 1) mondayDate = now;
  else {
    const daysUntilMonday = ((8 - day) % 7) || 7;
    mondayDate = addDays(now, daysUntilMonday);
  }
  const weekOf = format(startOfDay(mondayDate), 'yyyy-MM-dd');
  return { mode, weekOf };
}

export function WeekendBanner() {
  const forceDay = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('banner_day') as BannerMode | null;
  }, []);
  const realCtx = useMemo(getWeekendContext, []);
  const mode: BannerMode = forceDay ?? realCtx.mode;
  const isWeekendish = mode === 'friday' || mode === 'saturday' || mode === 'sunday';
  const isMonday = mode === 'monday';
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
      realMode: realCtx.mode,
      forceDay,
      effectiveMode: mode,
      weekOf,
      hint: mode === 'none'
        ? 'Banner hidden — add ?banner_day=friday|saturday|sunday|monday to URL to force-show'
        : `Banner will render in ${mode} mode`,
    });
  }, [realCtx, forceDay, mode, weekOf]);

  useEffect(() => {
    if (!isWeekendish && !isMonday) { setLoaded(true); return; }
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
  }, [isWeekendish, isMonday, weekOf]);

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  if (!loaded || dismissed || (!isWeekendish && !isMonday)) return null;

  const heading = DAY_HEADINGS[mode];

  if (isWeekendish) {
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
                  {heading}
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
                  <h2 className="font-heading font-extrabold text-2xl tracking-tight">{heading}</h2>
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

  const handleQuickReflection = async (text: string) => {
    setSaving(true);
    setDismissed(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('cos_weekend_vibes')
        .update({ monday_reflection: text, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('week_of', weekOf);
      if (error) console.error('Reflection save failed:', error.message);
    } catch (err) {
      console.error('Reflection save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  if (isMonday && vibes?.image_url && !vibes.monday_reflection) {
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
              <p className="text-white/85 italic font-heading font-bold text-2xl tracking-tight drop-shadow-lg mb-1">
                {vibes.friday_prompt}
              </p>
              <p className="text-white font-heading font-extrabold text-2xl tracking-tight drop-shadow-lg mb-3">
                How was it?
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { emoji: '🤩', label: 'Amazing' },
                  { emoji: '😌', label: 'So, so very good' },
                  { emoji: '🔁', label: "Can't wait to do it again" },
                  { emoji: '🫠', label: "Didn't happen" },
                ].map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => handleQuickReflection(opt.label)}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 backdrop-blur-sm text-white text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    <span>{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return null;
}
