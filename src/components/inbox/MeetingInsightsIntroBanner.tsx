import { Video, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// First-run intro for meeting_insight cards (PLAN_idea3_meeting_insights.md
// §9.1, §9.4). Rendered once, directly above the first meeting_insight card a
// user ever sees — gated by cos_settings.onboarding_completed.meetingInsightsIntro
// via useOnboardingState (see src/hooks/useOnboardingState.ts). Reuses
// WeekendBanner's dismissible-top-banner visual idiom, not its component,
// since the data/gating logic here is unrelated.
export function MeetingInsightsIntroBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 mb-2 rounded-xl border border-blue-200 bg-blue-50/70',
      )}
    >
      <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
        <Video className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-blue-900">New: Meeting insights</p>
        <p className="text-xs text-blue-800/90 mt-0.5">
          We caught something worth acting on in a recent recording. Review it below, then{' '}
          <span className="font-medium">Confirm</span> to turn it into a task,{' '}
          <span className="font-medium">Save</span> to keep it as a note, or{' '}
          <span className="font-medium">Dismiss</span> if it's not useful. Nothing happens until you choose.
        </p>
        <p className="text-xs text-blue-700/80 mt-1.5">
          Dismissing is always safe — it just means "not useful," not "stop showing me these."
          You can turn meeting insights off entirely in Settings if they're not for you.
        </p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Got it — dismiss this intro"
        className="flex-shrink-0 p-1 rounded text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
