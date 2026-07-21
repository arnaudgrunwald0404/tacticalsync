import React, { useState, useMemo } from 'react';
import { Sparkles, Plus, X, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { CosLayoutConfig } from '@/types/cos';
import { useMeetingSuggestions, type MeetingSuggestion } from '@/hooks/useMeetingSuggestions';
import { SuggestionSwipeSheet, type SwipeItem } from '@/components/inbox/SuggestionSwipeSheet';

interface Member { id: string; name: string }

interface Props {
  userId: string;
  layoutConfig: CosLayoutConfig;
  members: Member[];
  onAddToList: (category: string, title: string) => Promise<void> | void;
}

// Stable per-person color so the same teammate always reads the same dot.
const DOT_COLORS = [
  'bg-emerald-400', 'bg-orange-400', 'bg-violet-400',
  'bg-sky-400', 'bg-rose-400', 'bg-amber-400', 'bg-teal-400',
];
function dotColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return DOT_COLORS[Math.abs(hash) % DOT_COLORS.length];
}

const MEETING_SOURCE_TYPES = ['meeting', 'one_on_one', 'recurring_meeting', 'group_meeting'];

function headerTitle(suggestions: MeetingSuggestion[]): string {
  if (suggestions.length === 0) return 'Suggested from your meetings';
  // Once non-meeting sources (e.g. Slack) are mixed in, the meeting-specific
  // framing no longer fits — fall back to a source-agnostic title.
  const allMeetings = suggestions.every(s => MEETING_SOURCE_TYPES.includes(s.source_type ?? ''));
  if (!allMeetings) return 'Suggested for your lists';
  const allOneOnOne = suggestions.every(s => s.source_type === 'one_on_one');
  if (allOneOnOne) return 'Suggested from your 1:1s';
  const anyOneOnOne = suggestions.some(s => s.source_type === 'one_on_one');
  return anyOneOnOne ? 'Suggested from your meetings & 1:1s' : 'Suggested from your meetings';
}

// "From 1:1 with Eric Larnard · 6 days overdue — blocks your Q3 narrative."
function provenance(s: MeetingSuggestion): string {
  const from = s.source ? `From ${s.source}` : 'From a meeting';
  return s.rationale ? `${from} · ${s.rationale}` : from;
}

export function SuggestedFromMeetingsPanel({ userId, layoutConfig, members, onAddToList }: Props) {
  const {
    suggestions, loading, refreshing, targetOptions, resolve, addToList, dismiss, refresh,
  } = useMeetingSuggestions({ userId, layoutConfig, members, onAddToList });

  const [sheetOpen, setSheetOpen] = useState(false);

  const swipeItems = useMemo<SwipeItem[]>(() => suggestions.map(s => {
    const target = resolve(s.suggested_category ?? undefined);
    const firstOption = targetOptions[0];
    const best = target ?? firstOption;
    return {
      id: s.id,
      title: s.title,
      subtitle: provenance(s),
      recommendedLabel: best
        ? `Add to ${best.columnLabel} · ${best.sectionLabel}`
        : 'Add to list',
      onAccept: () => { if (best) addToList(s.id, best.category); },
      onDismiss: () => dismiss(s.id),
      renderPickerTrigger: targetOptions.length > 1 ? () => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline"
              className="h-9 shrink-0 gap-1 border-white/30 bg-transparent px-2.5 text-white hover:bg-white/20 hover:text-white"
              title="Add to a different list">
              Add to…<ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
            {targetOptions.map(opt => (
              <DropdownMenuItem key={opt.category} onSelect={() => addToList(s.id, opt.category)}
                className={cn('text-xs', target && opt.category === target.category && 'font-semibold')}>
                <span className="mr-1.5 uppercase tracking-wide text-muted-foreground">{opt.columnLabel}</span>
                {opt.sectionLabel}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : undefined,
    } satisfies SwipeItem;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [suggestions, targetOptions]);

  if (loading || suggestions.length === 0) return null;

  return (
    <div
      className="mb-6 rounded-2xl border border-white/10 p-3 sm:p-5"
      style={{ background: 'linear-gradient(135deg, #042a55 0%, #0a3f7a 55%, #0760c6 130%)' }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-3 px-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 shadow-sm ring-1 ring-white/20">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <h3 className="text-base font-semibold text-white">{headerTitle(suggestions)}</h3>
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
          <span className="hidden text-sm text-white/60 sm:inline">Add to a list or dismiss</span>
        </div>
      </div>

      {/* Mobile: tap-to-swipe summary row */}
      <button
        className="sm:hidden flex w-full items-center justify-between rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-left transition-colors hover:bg-white/15 active:bg-white/20"
        onClick={() => setSheetOpen(true)}
      >
        <span className="text-sm font-medium text-white">
          Review {suggestions.length} suggestion{suggestions.length > 1 ? 's' : ''}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/60" />
      </button>

      {/* Desktop: full row list */}
      <div className="hidden sm:block space-y-2">
        {suggestions.map(s => {
          const target = resolve(s.suggested_category ?? undefined);
          const seed = s.memberName ?? s.source ?? s.id;
          return (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 sm:px-4 sm:py-3"
            >
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dotColor(seed))} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{s.title}</p>
                <p className="truncate text-xs text-white/60">{provenance(s)}</p>
              </div>

              {/* Forces action buttons onto their own line on mobile */}
              <div className="basis-full sm:hidden" />

              {/* Action buttons share a wrapper so the ml-[22px] indent applies once on mobile */}
              <div className="flex items-center gap-2 ml-[22px] sm:contents sm:ml-0">
                {/* Primary: add straight to the suggested list. */}
                {target && (
                  <Button
                    size="sm"
                    onClick={() => addToList(s.id, target.category)}
                    className="h-8 shrink-0 gap-1 bg-white/20 px-3 text-white hover:bg-white/30 border-0 flex-1 sm:flex-none"
                    title={`Add to ${target.columnLabel} · ${target.sectionLabel}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Add to</span>
                    <span className="font-semibold uppercase tracking-wide">{target.columnLabel}</span>
                    <span className="opacity-60">·</span>
                    <span className="max-w-[110px] truncate">{target.sectionLabel}</span>
                  </Button>
                )}

                {/* Secondary: choose a different list from the full set of sections. */}
                {targetOptions.length > 1 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 gap-1 border-white/30 bg-transparent px-2.5 text-white hover:bg-white/20 hover:text-white"
                        title="Add to a different list"
                      >
                        Add to…
                        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                      {targetOptions.map(opt => (
                        <DropdownMenuItem
                          key={opt.category}
                          onSelect={() => addToList(s.id, opt.category)}
                          className={cn('text-xs', target && opt.category === target.category && 'font-semibold')}
                        >
                          <span className="mr-1.5 uppercase tracking-wide text-muted-foreground">{opt.columnLabel}</span>
                          {opt.sectionLabel}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <button
                  onClick={() => dismiss(s.id)}
                  className="shrink-0 rounded-md p-1.5 text-white/50 hover:bg-white/15 hover:text-white transition-colors"
                  aria-label="Dismiss suggestion"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>{/* end desktop rows */}

      <SuggestionSwipeSheet
        items={swipeItems}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
