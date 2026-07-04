import { useState } from 'react';
import { Sparkles, Plus, X, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMeetingSuggestions } from '@/hooks/useMeetingSuggestions';
import type { InboxItemType } from '@/types/inbox';

// Stable per-person dot color (same palette as the CoS panel)
const DOT_COLORS = [
  'bg-emerald-400', 'bg-orange-400', 'bg-violet-400',
  'bg-sky-400', 'bg-rose-400', 'bg-amber-400', 'bg-teal-400',
];
function dotColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return DOT_COLORS[Math.abs(hash) % DOT_COLORS.length];
}

function provenance(s: { source: string | null; rationale: string | null }): string {
  const from = s.source ? `From ${s.source}` : 'From a meeting';
  return s.rationale ? `${from} · ${s.rationale}` : from;
}

interface Member { id: string; name: string }

interface Props {
  userId: string;
  members: Member[];
  onAddItem: (text: string, type: InboxItemType, tagIds: string[]) => Promise<void>;
}

const COLLAPSED_COUNT = 3;

export function InboxSuggestionsPanel({ userId, members, onAddItem }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Pass null layoutConfig — we don't need CoS target lists here, just the suggestions
  const {
    suggestions, loading, refreshing, dismiss, refresh,
    addToList,
  } = useMeetingSuggestions({
    userId,
    layoutConfig: null as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    members,
    onAddToList: async (_category: string, title: string) => {
      await onAddItem(title, 'task', []);
    },
  });

  if (loading || suggestions.length === 0) return null;

  const allMeetings = suggestions.every(s =>
    ['meeting', 'one_on_one', 'recurring_meeting', 'group_meeting'].includes(s.source_type ?? '')
  );
  const allOneOnOne = suggestions.every(s => s.source_type === 'one_on_one');
  const anyOneOnOne = suggestions.some(s => s.source_type === 'one_on_one');
  const panelTitle = !allMeetings
    ? 'Suggested for your inbox'
    : allOneOnOne
    ? 'Suggested from your 1:1s'
    : anyOneOnOne
    ? 'Suggested from your meetings & 1:1s'
    : 'Suggested from your meetings';

  return (
    <div
      className="m-3 mb-0 rounded-2xl border border-white/10 p-3 sm:p-4"
      style={{ background: 'linear-gradient(135deg, #042a55 0%, #0a3f7a 55%, #0760c6 130%)' }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-3 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 shadow-sm ring-1 ring-white/20">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
        <h3 className="text-sm font-semibold text-white">{panelTitle}</h3>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/15 px-1.5 text-xs font-medium text-white/80 ring-1 ring-white/20">
          {suggestions.length}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors disabled:opacity-50"
            title="Re-scan recent meetings"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
          <span className="hidden text-xs text-white/50 sm:inline">Add to inbox or dismiss</span>
        </div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {(expanded ? suggestions : suggestions.slice(0, COLLAPSED_COUNT)).map(s => {
          const seed = s.memberName ?? s.source ?? s.id;
          return (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5"
            >
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dotColor(seed))} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{s.title}</p>
                <p className="truncate text-xs text-white/60">{provenance(s)}</p>
              </div>

              <Button
                size="sm"
                onClick={() => addToList(s.id, s.suggested_category ?? 'inbox')}
                className="h-8 shrink-0 gap-1.5 bg-white/20 px-3 text-white hover:bg-white/30 border-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Add to inbox
              </Button>

              <button
                onClick={() => dismiss(s.id)}
                className="shrink-0 rounded-md p-1.5 text-white/50 hover:bg-white/15 hover:text-white transition-colors"
                aria-label="Dismiss suggestion"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {suggestions.length > COLLAPSED_COUNT && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            {expanded ? (
              <><ChevronUp className="h-3.5 w-3.5" />Show fewer</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5" />Show {suggestions.length - COLLAPSED_COUNT} more</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
