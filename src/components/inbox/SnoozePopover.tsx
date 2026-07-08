import { useState } from 'react';
import { Clock, Sun, CalendarDays, CalendarClock, Users, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as DatePickerCalendar } from '@/components/ui/calendar';
import { computeSnoozeDate, type SnoozeRelativeOption } from '@/lib/inboxValidation';
import type { InboxTag } from '@/types/inbox';
import type { TeamMember } from '@/hooks/useTeamMembers';

// localStorage-gated, once-ever intro line — see PLAN_idea2_dormant20.md
// Section 5.1. Pure client-side education, no DB column needed.
const SNOOZE_INTRO_SEEN_KEY = 'inbox_snooze_intro_seen';

function hasSeenSnoozeIntro(): boolean {
  try {
    return localStorage.getItem(SNOOZE_INTRO_SEEN_KEY) === '1';
  } catch {
    return true; // storage unavailable — don't block on it, just skip the intro
  }
}

function markSnoozeIntroSeen(): void {
  try {
    localStorage.setItem(SNOOZE_INTRO_SEEN_KEY, '1');
  } catch {
    // ignore — private browsing / storage disabled
  }
}

const RELATIVE_OPTIONS: { key: SnoozeRelativeOption; label: string; icon: React.ReactNode }[] = [
  { key: 'later_today', label: 'Later today',      icon: <Clock className="h-3.5 w-3.5" /> },
  { key: 'tomorrow',    label: 'Tomorrow morning',  icon: <Sun className="h-3.5 w-3.5" /> },
  { key: 'weekend',     label: 'This weekend',      icon: <CalendarDays className="h-3.5 w-3.5" /> },
  { key: 'next_week',   label: 'Next week',         icon: <CalendarClock className="h-3.5 w-3.5" /> },
];

interface SnoozePopoverProps {
  /** People available for "until my next 1:1 with…" — person tags already in
   *  use, plus any team member not yet tagged. */
  personTags: InboxTag[];
  teamMembers?: TeamMember[];
  onSnooze: (until: Date) => void;
  /** Returns false if no upcoming 1:1 could be resolved for that member. */
  onSnoozeUntilNext1on1: (teamMemberId: string) => Promise<boolean>;
  trigger: React.ReactNode;
}

export function SnoozePopover({ personTags, teamMembers, onSnooze, onSnoozeUntilNext1on1, trigger }: SnoozePopoverProps) {
  const [open, setOpen] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(hasSeenSnoozeIntro());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [personPickerOpen, setPersonPickerOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [noMeetingWarning, setNoMeetingWarning] = useState(false);
  const [resolving, setResolving] = useState(false);

  const dismissIntro = () => {
    if (!introDismissed) {
      markSnoozeIntroSeen();
      setIntroDismissed(true);
    }
  };

  const choosePeople = () => {
    // Merge person tags (already in use in the inbox) with team members not
    // yet tagged, de-duped by underlying cos_team_members id.
    const seen = new Set(personTags.map(t => t.member_id).filter(Boolean));
    const extraMembers = (teamMembers ?? []).filter(m => !seen.has(m.id));
    return { personTags, extraMembers };
  };
  const { personTags: people, extraMembers } = choosePeople();

  const handleRelative = (option: SnoozeRelativeOption) => {
    dismissIntro();
    onSnooze(computeSnoozeDate(option));
    setOpen(false);
  };

  const handleFixedDate = (date: Date | undefined) => {
    if (!date) return;
    dismissIntro();
    onSnooze(date);
    setPickerOpen(false);
    setOpen(false);
  };

  const handlePersonSelect = async (memberId: string) => {
    dismissIntro();
    setSelectedMemberId(memberId);
    setNoMeetingWarning(false);
    setResolving(true);
    const ok = await onSnoozeUntilNext1on1(memberId);
    setResolving(false);
    if (ok) {
      setOpen(false);
      setPersonPickerOpen(false);
    } else {
      // Block — do not silently snooze with nothing to wake it up. Surface
      // the blocking warning and let the user fall back to a fixed date.
      setNoMeetingWarning(true);
    }
  };

  const selectedName = selectedMemberId
    ? (people.find(t => t.member_id === selectedMemberId)?.name
        ?? extraMembers.find(m => m.id === selectedMemberId)?.name
        ?? 'them')
    : null;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setPersonPickerOpen(false); setNoMeetingWarning(false); } }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end" onClick={e => e.stopPropagation()}>
        {!introDismissed && (
          <div className="px-3 py-2 text-[11px] text-gray-500 bg-gray-50 border-b border-gray-100 leading-snug">
            Snoozed items come back automatically — you'll see them again in your inbox once it's time.
          </div>
        )}

        {!personPickerOpen ? (
          <div className="py-1">
            {RELATIVE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => handleRelative(opt.key)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
              >
                <span className="text-gray-400">{opt.icon}</span>
                {opt.label}
              </button>
            ))}

            <button
              onClick={() => setPickerOpen(v => !v)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="text-gray-400"><CalendarDays className="h-3.5 w-3.5" /></span>
              Pick a date…
            </button>
            {pickerOpen && (
              <div className="border-t border-gray-100">
                <DatePickerCalendar mode="single" onSelect={handleFixedDate} initialFocus />
              </div>
            )}

            {(people.length > 0 || extraMembers.length > 0) && (
              <button
                onClick={() => setPersonPickerOpen(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left border-t border-gray-100"
              >
                <span className="text-gray-400"><Users className="h-3.5 w-3.5" /></span>
                Until my next 1:1 with…
                <span
                  title="We'll bring this back right before your next scheduled 1:1 with them. If none is on the calendar yet, we'll ask you to pick a fallback date instead — no meeting means no auto-return."
                  className="ml-auto text-gray-300 hover:text-gray-500"
                >
                  <Info className="h-3.5 w-3.5" />
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="py-1">
            <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-gray-400 font-medium">
              Snooze until next 1:1 with
            </div>
            {noMeetingWarning && (
              <div className="mx-3 mb-2 px-2.5 py-2 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  No upcoming 1:1 found with {selectedName}. Pick a date instead, or add one to your
                  calendar first.
                </span>
              </div>
            )}
            {[...people.map(t => ({ id: t.member_id!, name: t.name })), ...extraMembers].map(p => (
              <button
                key={p.id}
                disabled={resolving}
                onClick={() => handlePersonSelect(p.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left',
                  resolving && 'opacity-50 cursor-wait',
                )}
              >
                {p.name}
              </button>
            ))}
            <button
              onClick={() => { setPersonPickerOpen(false); setNoMeetingWarning(false); }}
              className="w-full px-3 py-2 text-xs text-gray-400 hover:text-gray-600 text-left border-t border-gray-100"
            >
              ← Back
            </button>
            {noMeetingWarning && (
              <button
                onClick={() => { setPersonPickerOpen(false); setPickerOpen(true); }}
                className="w-full px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 text-left border-t border-gray-100"
              >
                Pick a date instead →
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
