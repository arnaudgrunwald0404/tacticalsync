import { X, Link2 } from 'lucide-react';

interface UnifiedFunnelAnnouncementBannerProps {
  onDismiss: () => void;
}

// One-time, top-of-inbox rollout announcement — fires once per user
// independent of whether they've actually received a synced item yet, so the
// behavior change is never a surprise the first time it happens (see
// PLAN_idea1_unified_funnel.md §6.4). Modeled after WeekendBanner's
// dismissible-top-card treatment (src/components/WeekendBanner.tsx), kept
// simpler since this is plain text + a dismiss, not an interactive widget.
export function UnifiedFunnelAnnouncementBanner({ onDismiss }: UnifiedFunnelAnnouncementBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-sm">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
        <Link2 className="h-4 w-4 text-gray-500" />
      </div>
      <p className="flex-1 text-sm text-gray-700 leading-relaxed">
        <span className="font-semibold text-gray-900">New: </span>
        Meeting and 1:1 to-dos now sync to your inbox automatically. Nothing you need to set up —
        action items assigned to you will just start showing up here.
      </p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
