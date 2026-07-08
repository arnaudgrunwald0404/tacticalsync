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
    <div className="mx-3 mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100">
        <Sparkles className="h-4 w-4 text-blue-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">This showed up automatically.</p>
        <p className="mt-0.5 text-xs text-gray-600 leading-relaxed">
          We noticed an action item assigned to you in a meeting or 1:1, so we added it here to
          keep it from getting lost. Check it off here or at the source — either way, it stays in
          sync.
        </p>
        <button
          onClick={onDismiss}
          className="mt-2 inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
