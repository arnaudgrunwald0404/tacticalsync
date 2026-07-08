import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Bumped only when a new "what's new" announcement should show again — a
// user who dismissed a previous release's banner shouldn't be shown a
// different release's banner as if they'd never seen anything (see
// PLAN_idea2_dormant20.md Section 5.3/5.4).
const WHATS_NEW_VERSION = 'inbox-idea2-dormant20';
const DISMISSED_KEY = `inbox_whats_new_dismissed_${WHATS_NEW_VERSION}`;

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return true;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // ignore
  }
}

interface BeforeAfter {
  before: string;
  after: string;
}

const ITEMS: BeforeAfter[] = [
  { before: 'No way to search your inbox — you scrolled to find things.', after: 'Press / to search everything, instantly.' },
  { before: "Snoozed items? There weren't any — done or not, that was it.", after: "Snooze anything for later — or until your next 1:1 with someone, so it comes back exactly when it's relevant again." },
  { before: 'Every time you opened your inbox, you rebuilt the same filter from scratch.', after: 'Save any filter + sort combo as a view, and jump straight to it next time.' },
  { before: 'Every action meant reaching for the mouse.', after: 'j/k to move, d to mark done, e to edit, s to snooze. Press ? anytime to see the full list.' },
];

interface InboxWhatsNewBannerProps {
  /**
   * Whether to show this at all — the caller resolves the account-age vs.
   * release-timestamp gate (Section 5.4) since that requires knowing the
   * user's account creation date, which this component doesn't fetch itself.
   */
  eligible: boolean;
  onShowShortcuts?: () => void;
}

export function InboxWhatsNewBanner({ eligible, onShowShortcuts }: InboxWhatsNewBannerProps) {
  const [dismissed, setDismissed] = useState(isDismissed());

  if (!eligible || dismissed) return null;

  const dismiss = () => {
    markDismissed();
    setDismissed(true);
  };

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm">
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-indigo-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-indigo-900">Your inbox just got faster.</p>
          <ul className="mt-2 space-y-1.5">
            {ITEMS.map((item, i) => (
              <li key={i} className="text-indigo-900/80 text-xs leading-relaxed">
                <span className="text-indigo-400">Before:</span> {item.before}{' '}
                <span className="text-indigo-500 font-medium">Now:</span> {item.after}
              </li>
            ))}
          </ul>
          <div className="mt-2.5 flex items-center gap-3">
            <button
              onClick={dismiss}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
            >
              Got it
            </button>
            {onShowShortcuts && (
              <button
                onClick={() => { onShowShortcuts(); }}
                className={cn('text-xs font-medium text-indigo-500 hover:text-indigo-700')}
              >
                Show me the shortcuts →
              </button>
            )}
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 text-indigo-300 hover:text-indigo-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
