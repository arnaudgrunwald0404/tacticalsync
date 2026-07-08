import { useState, useEffect } from 'react';
import { X, Brain } from 'lucide-react';

const STORAGE_KEY = 'inbox:whatsnew:person-memory:dismissed';

/**
 * "What's new" callout for Idea #7 (Relationship memory), per
 * PLAN_idea7_relationship_memory.md §7a.3. This codebase has no existing
 * changelog/what's-new surface (checked: no WhatsNew component, no
 * feature-announcements table reachable from this branch) — this is the
 * plan's explicit fallback: a dismissible in-app banner gated on a
 * localStorage "seen" flag rather than a per-user DB column, since this is
 * meant to be cheap and removable once a real changelog mechanism exists.
 *
 * Deep-links to the viewing user's own first person tag when available, per
 * the plan's note that a live link into the user's own data lands better
 * than a generic example.
 */
interface WhatsNewPersonMemoryBannerProps {
  /** First person tag belonging to the viewing user, if any — used to make
   *  the "View page" link go somewhere real instead of a dead end. */
  examplePersonMemberId?: string | null;
  examplePersonName?: string | null;
  onViewPersonPage?: (memberId: string) => void;
}

export function WhatsNewPersonMemoryBanner({
  examplePersonMemberId, examplePersonName, onViewPersonPage,
}: WhatsNewPersonMemoryBannerProps) {
  const [dismissed, setDismissed] = useState(true); // default hidden until we check storage, to avoid a flash

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === 'true');
    } catch {
      // localStorage unavailable (e.g. private browsing edge cases) — fail open to hidden
      setDismissed(true);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* non-fatal */ }
  };

  if (dismissed) return null;

  const exampleName = examplePersonName ?? 'a teammate';

  return (
    <div className="flex items-start gap-3 mx-2 mt-2 mb-1 px-4 py-3 rounded-lg bg-gradient-to-r from-indigo-50 to-white border border-indigo-100">
      <Brain className="h-4 w-4 text-indigo-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">New: Every 1:1 now starts with a brief.</p>
        <p className="text-xs text-gray-600 mt-0.5">
          Before: you had to remember or scroll back through old notes to recall what you
          discussed with {exampleName}. Now: 24 hours before your 1:1, a brief lands in your
          inbox — what's open on both sides, what's changed since you last talked, and a few
          suggested talking points. Click any person's name tag to see their full history in one
          place.
        </p>
        {examplePersonMemberId && onViewPersonPage && (
          <button
            onClick={() => onViewPersonPage(examplePersonMemberId)}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors mt-1.5"
          >
            View {exampleName}'s person page &rarr;
          </button>
        )}
      </div>
      <button
        onClick={dismiss}
        className="flex-shrink-0 p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
