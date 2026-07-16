import { Sparkles } from 'lucide-react';

interface AutoSyncIntroCalloutProps {
  onDismiss: () => void;
}

// One-time card shown above the first auto-synced inbox item a user ever
// sees (a meeting action item or 1:1 "for me" commitment mirrored in by a DB
// trigger — see src/types/inbox.ts's SourceRef doc comment). Without this,
// an item nobody typed into the inbox reads as a bug or a duplicate rather
// than a feature — see PLAN_idea1_unified_funnel.md §6.1.
export function AutoSyncIntroCallout({ onDismiss }: AutoSyncIntroCalloutProps) {
  return (
    <div className="mb-3 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/15">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">These showed up automatically.</p>
        <p className="mt-0.5 text-xs text-white/70 leading-relaxed">
          We noticed action items assigned to you in meetings or 1:1s. Add them to your inbox or dismiss — your call.
        </p>
        <button
          onClick={onDismiss}
          className="mt-2 inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-white/20 text-white hover:bg-white/30 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
