import React, { useState } from 'react';
import { Sparkles, Plus, X, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { CosLayoutConfig } from '@/types/cos';
import { useMeetingSuggestions, type MeetingSuggestion } from '@/hooks/useMeetingSuggestions';
import type { TargetOption } from '@/lib/meetingSuggestions';

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

function headerTitle(suggestions: MeetingSuggestion[]): string {
  if (suggestions.length === 0) return 'Suggested from your meetings';
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

function RoutingChip({
  target, options, onSelect,
}: {
  target: TargetOption | undefined;
  options: TargetOption[];
  onSelect: (category: string) => void;
}) {
  if (!target) return null;
  const label = (
    <>
      <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
      <span className="font-medium uppercase tracking-wide">{target.columnLabel}</span>
      <span className="opacity-50">·</span>
      <span className="truncate">{target.sectionLabel}</span>
    </>
  );

  if (options.length <= 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
        {label}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted/70 transition-colors max-w-[180px]"
          title="Change destination list"
        >
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
        {options.map(opt => (
          <DropdownMenuItem
            key={opt.category}
            onSelect={() => onSelect(opt.category)}
            className={cn('text-xs', opt.category === target.category && 'font-semibold')}
          >
            <span className="uppercase tracking-wide text-muted-foreground mr-1.5">{opt.columnLabel}</span>
            {opt.sectionLabel}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SuggestedFromMeetingsPanel({ userId, layoutConfig, members, onAddToList }: Props) {
  const {
    suggestions, loading, refreshing, targetOptions, resolve, addToList, dismiss, refresh,
  } = useMeetingSuggestions({ userId, layoutConfig, members, onAddToList });

  // Per-row destination override (before the user hits Add).
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  if (loading || suggestions.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-border/60 bg-muted/30 p-3 sm:p-5">
      {/* Header */}
      <div className="mb-3 flex items-center gap-3 px-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border/50">
          <Sparkles className="h-4 w-4 text-copper" />
        </div>
        <h3 className="text-base font-semibold text-foreground">{headerTitle(suggestions)}</h3>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border/50">
          {suggestions.length}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Re-scan recent meetings"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
          <span className="hidden text-sm text-muted-foreground sm:inline">Add to a list or dismiss</span>
        </div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {suggestions.map(s => {
          const chosenCategory = overrides[s.id] ?? s.suggested_category ?? undefined;
          const target = resolve(chosenCategory);
          const seed = s.memberName ?? s.source ?? s.id;
          return (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-xl border border-border/50 bg-background px-3 py-2.5 sm:px-4 sm:py-3"
            >
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dotColor(seed))} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{s.title}</p>
                <p className="truncate text-xs text-muted-foreground">{provenance(s)}</p>
              </div>

              <RoutingChip
                target={target}
                options={targetOptions}
                onSelect={(category) => setOverrides(prev => ({ ...prev, [s.id]: category }))}
              />

              <Button
                size="sm"
                onClick={() => target && addToList(s.id, target.category)}
                disabled={!target}
                className="h-8 shrink-0 gap-1 px-3"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>

              <button
                onClick={() => dismiss(s.id)}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Dismiss suggestion"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
