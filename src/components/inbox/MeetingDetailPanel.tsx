import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  ArrowLeft, CalendarDays, Sparkles, Send, Video, Loader2,
  FileText, History, Settings, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { parsePrepMarkdown, type TopicSection } from '@/components/cos/OneOnOnePrepDrawer';
import { RelationshipTimeline } from '@/components/cos/RelationshipTimeline';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { UpcomingOneOnOneEvent } from '@/components/cos/OneOnOnesView';

interface MeetingDetailPanelProps {
  event: UpcomingOneOnOneEvent;
  onBack: () => void;
  /** When true the left rail is hidden (rendered in the sidebar instead) */
  hideSidebar?: boolean;
  /** Controlled active tab — if provided, internal state is ignored */
  activeTabOverride?: TabKey;
  onTabChange?: (tab: TabKey) => void;
}

type TabKey = 'prep' | 'past' | 'timeline' | 'settings';

interface ZoomRec {
  id: string;
  topic: string | null;
  start_time: string;
  duration_minutes: number | null;
  has_transcript: boolean;
  ai_summary: string | null;
}

const QUESTIONS = [
  { text: "What's the single biggest blocker on your plate right now?", tag: 'Blockers' },
  { text: 'What do you need from me to keep things on track?', tag: 'Support' },
  { text: 'How are you feeling about your current workload and priorities?', tag: 'Workload' },
  { text: 'Is our current 1:1 cadence working for you?', tag: 'Feedback' },
];

const TAG_COLORS: Record<string, string> = {
  Blockers: 'bg-red-50 text-red-600',
  Support: 'bg-emerald-50 text-emerald-600',
  Workload: 'bg-amber-50 text-amber-600',
  Feedback: 'bg-blue-50 text-blue-600',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function TopicCard({ section }: { section: TopicSection }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
      {section.heading && (
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">{section.heading}</h3>
      )}
      {section.paragraphs.map((p, i) => (
        <p key={i} className="text-sm text-gray-700 leading-relaxed mb-2 last:mb-0">{p}</p>
      ))}
      {section.bullets.length > 0 && (
        <ul className="flex flex-col gap-2 mt-1">
          {section.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700 leading-snug">
              <span className="text-gray-300 flex-shrink-0 mt-1">•</span>
              <span dangerouslySetInnerHTML={{ __html: b.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/_(.+?)_/g, '<em>$1</em>') }} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MeetingDetailPanel({ event, onBack, hideSidebar = false, activeTabOverride, onTabChange }: MeetingDetailPanelProps) {
  const member = event.team_member;
  const name = member?.name ?? event.attendee_name ?? event.attendee_email ?? 'Unknown';
  const firstName = name.split(' ')[0];
  const role = member?.role ?? 'Team member';
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const title = event.title ?? `1:1 with ${name}`;
  const timeStr = `${format(start, 'EEE, MMM d')} · ${format(start, 'h:mm')}–${format(end, 'h:mm a')}`;

  const [activeTabInternal, setActiveTabInternal] = useState<TabKey>('prep');
  const activeTab = activeTabOverride ?? activeTabInternal;
  const setActiveTab = (tab: TabKey) => {
    setActiveTabInternal(tab);
    onTabChange?.(tab);
  };

  // Prep tab
  const [sections, setSections] = useState<TopicSection[] | null>(null);
  const [loadingPrep, setLoadingPrep] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  // Past 1:1s tab
  const [zoomRecs, setZoomRecs] = useState<ZoomRec[]>([]);

  useEffect(() => {
    if (!member?.id) { setLoadingPrep(false); return; }
    setLoadingPrep(true);
    const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingPrep(false); return; }
      const { data } = await db
        .from('cos_one_on_one_prep')
        .select('content, generated_at')
        .eq('user_id', user.id)
        .eq('team_member_id', member.id)
        .eq('status', 'ready')
        .order('prep_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.content) {
        setSections(parsePrepMarkdown(data.content));
        setGeneratedAt(data.generated_at ?? null);
      } else {
        setSections([]);
      }
      setLoadingPrep(false);
    })();

    db.from('cos_zoom_recordings')
      .select('id, topic, start_time, duration_minutes, has_transcript, ai_summary')
      .eq('team_member_id', member.id)
      .order('start_time', { ascending: false })
      .limit(8)
      .then(({ data }: { data: ZoomRec[] | null }) => setZoomRecs(data ?? []))
      .catch(() => setZoomRecs([]));
  }, [member?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const prepAvailable = sections !== null && sections.length > 0;

  const NAV_TABS: Array<{ key: TabKey; label: string; badge?: number }> = [
    { key: 'prep', label: 'Prep' },
    { key: 'past', label: 'Past 1:1s', badge: zoomRecs.length || undefined },
    { key: 'timeline', label: 'Timeline' },
  ];

  return (
    <div className={cn('flex h-full min-h-0 bg-gray-50 overflow-hidden', !hideSidebar && 'rounded-xl border border-gray-200/80')}>

      {/* ── Left rail — hidden when rendered in sidebar ─────────────────────── */}
      {!hideSidebar && (
      <div className="w-[240px] flex-shrink-0 bg-white border-r border-gray-100 flex flex-col px-5 py-4 gap-6 overflow-y-auto">

        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors -ml-0.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Calendar
        </button>

        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
            {initials(name)}
          </div>
          <div className="text-center">
            <div className="text-[17px] font-bold text-gray-900 leading-tight">{name}</div>
            <div className="text-sm text-gray-400 mt-1">{role}</div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-blue-600">
            <CalendarDays className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm font-semibold leading-tight">{title}</span>
          </div>
          <div className="text-xs text-blue-500 pl-6">{timeStr}</div>
        </div>

        {generatedAt && (
          <div className="text-xs text-gray-400 -mt-3">
            Prep generated {format(new Date(generatedAt), 'MMM d')}
          </div>
        )}

        {/* Nav items */}
        <nav className="flex flex-col mt-1">
          {NAV_TABS.map(t => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-sm transition-colors text-left w-full',
                  active
                    ? 'font-semibold text-gray-900 bg-gray-100'
                    : 'font-normal text-gray-500 hover:text-gray-800 hover:bg-gray-50',
                )}
              >
                {t.label}
                {t.badge != null && (
                  <Badge className="h-5 min-w-[20px] px-1.5 text-[11px] font-bold bg-gray-600 text-white border-0">
                    {t.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>

        {/* Settings at the bottom */}
        <div className="mt-auto pt-4 border-t border-gray-100">
          <button
            onClick={() => setActiveTab('settings')}
            className={cn(
              'flex items-center gap-2 px-2 py-2.5 rounded-lg text-sm transition-colors w-full',
              activeTab === 'settings'
                ? 'font-semibold text-gray-900 bg-gray-100'
                : 'font-normal text-gray-400 hover:text-gray-700 hover:bg-gray-50',
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </div>
      </div>
      )}

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Action buttons */}
        <div className="flex-shrink-0 flex items-center gap-2 border-b border-gray-200 bg-white px-5 py-2.5">
          {!hideSidebar && (
            <>
              <button className="flex items-center gap-1.5 text-sm px-3.5 py-1.5 bg-[#3d5a6e] text-white rounded-lg hover:bg-[#2f4759] transition-colors font-medium">
                <Video className="h-3.5 w-3.5" />
                Join call
              </button>
              <div className="w-px h-5 bg-gray-200 mx-0.5" />
            </>
          )}
          <button className="flex items-center gap-1.5 text-sm px-3.5 py-1.5 bg-[#3d5a6e] text-white rounded-lg hover:bg-[#2f4759] transition-colors font-medium ring-2 ring-orange-400 ring-offset-1">
            <Sparkles className="h-3.5 w-3.5 text-orange-400" />
            AI generate
          </button>
          <button className="flex items-center gap-1.5 text-sm px-3.5 py-1.5 bg-[#3d5a6e] text-white rounded-lg hover:bg-[#2f4759] transition-colors font-medium">
            <Send className="h-3.5 w-3.5" />
            Share
          </button>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <button onClick={onBack} className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* ── Prep tab ── */}
          {activeTab === 'prep' && (
            <div className="flex min-h-0">
              <div className="flex-1 p-5 flex flex-col gap-4">
                {loadingPrep && (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading prep…
                  </div>
                )}

                {!loadingPrep && prepAvailable && sections!.map((section, i) => (
                  <TopicCard key={i} section={section} />
                ))}

                {!loadingPrep && !prepAvailable && (
                  <div className="bg-white rounded-xl border border-gray-200/80 border-dashed p-8 text-center">
                    <Sparkles className="h-7 w-7 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-500">No prep yet</p>
                    <p className="text-xs text-gray-400 mt-1">Generate a prep brief to see talking points and context here.</p>
                    <button className="mt-4 flex items-center gap-1.5 text-xs px-4 py-2 bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 transition-colors font-medium mx-auto">
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate prep
                    </button>
                  </div>
                )}
              </div>

              {/* Right panel: questions to ask */}
              <div className="w-[220px] flex-shrink-0 bg-white border-l border-gray-100 flex flex-col p-4 gap-3 overflow-y-auto">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Questions to ask</div>
                <p className="text-[11px] text-gray-400 -mt-2">Pick a few to anchor the conversation.</p>
                <div className="flex flex-col gap-3">
                  {QUESTIONS.map((q, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <p className="text-xs text-gray-700 leading-relaxed">{q.text}</p>
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded self-start', TAG_COLORS[q.tag] ?? 'bg-gray-100 text-gray-500')}>
                        {q.tag}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Past 1:1s tab ── */}
          {activeTab === 'past' && (
            <div className="p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3 px-4 py-3.5 rounded-lg bg-accent/50 border border-border/70">
                <span className="w-8 h-8 flex-shrink-0 rounded-lg bg-card grid place-items-center shadow-sm">
                  <FileText className="h-4 w-4 text-primary" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold mb-0.5">Summaries from your past 1:1s</div>
                  <div className="text-xs leading-relaxed text-muted-foreground">Pulled from your Zoom calls. When Zoom's AI Companion is on, its meeting summary shows here automatically.</div>
                </div>
              </div>

              {zoomRecs.length === 0 ? (
                <div className="text-center py-16 text-sm text-muted-foreground">
                  <Video className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  No past 1:1s recorded yet. Once your Zoom calls with {firstName} are synced, their summaries appear here.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {zoomRecs.map(rec => {
                    const d = new Date(rec.start_time);
                    return (
                      <div key={rec.id} className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                          <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-white border border-gray-200 flex flex-col items-center justify-center leading-none">
                            <span className="text-[9px] font-bold tracking-wide uppercase text-primary">{MONTHS[d.getMonth()]}</span>
                            <span className="text-base font-bold mt-px">{d.getDate()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold truncate">{rec.topic ?? `1:1 with ${firstName}`}</div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400">
                              <span>{format(d, 'MMM d, yyyy')}</span>
                              {rec.duration_minutes != null && <><span>·</span><span>{rec.duration_minutes} min</span></>}
                            </div>
                          </div>
                          {rec.has_transcript && (
                            <Badge variant="outline" className="text-[11px] h-6 px-2.5 border-emerald-200 text-emerald-700">Transcript</Badge>
                          )}
                        </div>
                        {rec.ai_summary && (
                          <div className="px-5 pt-4 text-sm leading-relaxed text-gray-700 whitespace-pre-line">{rec.ai_summary}</div>
                        )}
                        <div className="flex items-center gap-2 px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Sparkles className="h-3 w-3 text-primary" />
                            {rec.ai_summary ? 'Summarized by Zoom AI Companion' : rec.has_transcript ? 'Transcript captured — summary pending' : 'Recording captured — summary pending'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Timeline tab ── */}
          {activeTab === 'timeline' && (
            <div className="p-5">
              {member ? (
                <RelationshipTimeline memberId={member.id} memberName={member.name} />
              ) : (
                <div className="text-center py-16 text-sm text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  Link this contact to a relationship to view their timeline.
                </div>
              )}
            </div>
          )}

          {/* ── Settings tab ── */}
          {activeTab === 'settings' && (
            <div className="p-5 flex flex-col gap-4">
              <div className="text-sm font-semibold text-gray-700">Settings</div>
              <div className="text-sm text-gray-400">Settings for this 1:1 will appear here.</div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
