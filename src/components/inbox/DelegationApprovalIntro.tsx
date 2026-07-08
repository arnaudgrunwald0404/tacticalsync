import { useState } from 'react';
import { Sparkles } from 'lucide-react';

const STORAGE_KEY = 'delegation_v2_intro_seen';

function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true; // if storage is unavailable, don't nag every render
  }
}

function markIntroSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // ignore — non-critical
  }
}

/** One-time banner shown above the first per-step approval list a user ever sees. This is a trust threshold, not a cosmetic change: approving a step now triggers a real, often irreversible action, where before it only dismissed a summary. See PLAN_idea6_delegation_v2.md §9.1. */
export function DelegationApprovalIntro() {
  const [dismissed, setDismissed] = useState(hasSeenIntro());
  if (dismissed) return null;

  const dismiss = () => {
    markIntroSeen();
    setDismissed(true);
  };

  return (
    <div className="mb-2 rounded-lg border border-violet-200 bg-violet-50 p-2.5 text-xs text-violet-900">
      <div className="flex gap-2">
        <Sparkles className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-violet-500" />
        <div className="space-y-1">
          <p className="font-medium">This is new: approving a step now does it for real.</p>
          <p className="text-violet-700 leading-relaxed">
            Each step below is a specific action your agent is ready to take — posting to Slack, adding a meeting topic. Nothing happens until you approve it, and you approve one step at a time. Once you click <span className="font-medium">Approve &amp; Execute</span>, that action happens immediately and can&apos;t be undone from here.
          </p>
          <button
            onClick={dismiss}
            className="text-xs font-medium text-violet-700 hover:text-violet-900 underline underline-offset-2"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
