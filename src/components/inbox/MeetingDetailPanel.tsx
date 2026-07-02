import { format } from 'date-fns';
import { ArrowLeft, CalendarDays, Sparkles, Send, Video, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UpcomingOneOnOneEvent } from '@/components/cos/OneOnOnesView';

interface MeetingDetailPanelProps {
  event: UpcomingOneOnOneEvent;
  onBack: () => void;
}

const PREP_STEPS = [
  { label: 'Context gathered', state: 'done' as const },
  { label: 'Questions drafted', state: 'done' as const },
  { label: 'Agenda built', state: 'in_progress' as const },
  { label: 'Share with person', state: 'pending' as const },
];

const AGENDA_ITEMS = [
  'Review last quarter OKR progress and blockers',
  'Discuss upcoming project handoff timeline',
  'Feedback on recent team presentation',
  'Career growth goals check-in',
];

const NOTES_FROM_LAST = [
  'Mentioned feeling stretched across two projects — needs clarity on priority.',
  'Interested in taking on more cross-functional work.',
  'Flagged process gaps in the deployment review checklist.',
];

const QUESTIONS = [
  { text: 'What's the biggest thing slowing you down right now?', tag: 'Blockers' },
  { text: 'Where do you want to grow most in the next 6 months?', tag: 'Growth' },
  { text: 'How is morale on the team feeling to you?', tag: 'Team dynamics' },
  { text: 'Are you feeling overloaded, or do you have capacity?', tag: 'Workload' },
  { text: 'What's one thing I could do better to support you?', tag: 'Feedback' },
];

const TAG_COLORS: Record<string, string> = {
  Blockers: 'bg-red-50 text-red-600',
  Growth: 'bg-emerald-50 text-emerald-600',
  'Team dynamics': 'bg-purple-50 text-purple-600',
  Workload: 'bg-amber-50 text-amber-600',
  Feedback: 'bg-blue-50 text-blue-600',
};

function StepDot({ state }: { state: 'done' | 'in_progress' | 'pending' }) {
  if (state === 'done') return <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />;
  if (state === 'in_progress') return <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />;
  return <div className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />;
}

function stepBadge(state: 'done' | 'in_progress' | 'pending') {
  if (state === 'done') return <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Done</span>;
  if (state === 'in_progress') return <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">In progress</span>;
  return <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Not sent</span>;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function MeetingDetailPanel({ event, onBack }: MeetingDetailPanelProps) {
  const member = event.team_member;
  const name = member?.name ?? event.attendee_name ?? event.attendee_email ?? 'Unknown';
  const role = member?.role ?? 'Team member';
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const title = event.title ?? `1:1 with ${name}`;
  const timeStr = `${format(start, 'EEE, MMM d')} · ${format(start, 'h:mm')}–${format(end, 'h:mm a')}`;

  return (
    <div className="flex h-full min-h-0 bg-gray-50 rounded-xl overflow-hidden border border-gray-200/80">

      {/* ── Left rail ──────────────────────────────────────────────────────── */}
      <div className="w-[220px] flex-shrink-0 bg-white border-r border-gray-100 flex flex-col p-4 gap-5 overflow-y-auto">

        {/* Back */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors -ml-0.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Calendar
        </button>

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-2 pt-1">
          <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-base flex-shrink-0">
            {initials(name)}
          </div>
          <div className="text-center">
            <div className="text-sm font-semibold text-gray-900">{name}</div>
            <div className="text-xs text-gray-500 mt-0.5">{role}</div>
          </div>
        </div>

        {/* Meeting chip */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-blue-700">
            <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-xs font-medium truncate">{title}</span>
          </div>
          <div className="text-[11px] text-blue-500">{timeStr}</div>
        </div>

        {/* Prep timeline */}
        <div className="flex flex-col gap-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Prep steps</div>
          {PREP_STEPS.map((step) => (
            <div key={step.label} className="flex items-center gap-2 py-1">
              <StepDot state={step.state} />
              <span className={cn('text-xs flex-1', step.state === 'pending' ? 'text-gray-400' : 'text-gray-700')}>
                {step.label}
              </span>
              {stepBadge(step.state)}
            </div>
          ))}
        </div>
      </div>

      {/* ── Center ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-5 gap-4">

        {/* Title + actions */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{timeStr}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 transition-colors font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              Generate
            </button>
            <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors font-medium">
              <Send className="h-3.5 w-3.5" />
              Share
            </button>
            <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
              <Video className="h-3.5 w-3.5" />
              Join
            </button>
          </div>
        </div>

        {/* Agenda card */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Agenda</h3>
            <button className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Add item
            </button>
          </div>
          <ol className="flex flex-col gap-2">
            {AGENDA_ITEMS.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span className="text-xs text-gray-400 tabular-nums mt-0.5 w-4 flex-shrink-0">{i + 1}.</span>
                {item}
              </li>
            ))}
          </ol>
        </div>

        {/* Notes from last time */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Notes from last time</h3>
          <ul className="flex flex-col gap-2">
            {NOTES_FROM_LAST.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <div className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0 mt-2" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      <div className="w-[220px] flex-shrink-0 bg-white border-l border-gray-100 flex flex-col p-4 gap-3 overflow-y-auto">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Questions to ask</div>
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
  );
}
