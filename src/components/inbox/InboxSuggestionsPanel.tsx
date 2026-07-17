import { useState } from 'react';
import { Sparkles, Plus, X, RefreshCw, ChevronDown, ChevronUp, ExternalLink, WifiOff } from 'lucide-react';
import { AutoSyncIntroCallout } from '@/components/inbox/AutoSyncIntroCallout';
import { Button } from '@/components/ui/button';
import { TagPickerDropdown } from '@/components/inbox/TagPickerDropdown';
import { cn } from '@/lib/utils';
import { useMeetingSuggestions, type MeetingSuggestion } from '@/hooks/useMeetingSuggestions';
import { useIntegrationHealth } from '@/hooks/useIntegrationHealth';
import type { InboxItemType, InboxTag } from '@/types/inbox';
import type { TeamMember } from '@/hooks/useTeamMembers';

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
  tags: InboxTag[];
  onAddItem: (text: string, type: InboxItemType, tagIds: string[]) => Promise<void>;
  /** When set (viewing a project/folder), only suggestions tagged with one of these ids are shown. */
  scopeTagIds?: string[];
  teamMembers?: TeamMember[];
  onCreateTag?: (name: string, type: 'project' | 'folder') => Promise<InboxTag | null>;
  onCreatePersonTag?: (member: TeamMember) => Promise<InboxTag | null>;
  showIntroCallout?: boolean;
  onDismissIntroCallout?: () => void;
}

const COLLAPSED_COUNT = 3;

// Top-level tags a suggestion can be routed to (mirrors suggest-inbox-tags' candidate set).
const DESTINATION_TYPES = new Set(['project', 'folder', 'person']);

export function InboxSuggestionsPanel({
  userId, members, tags, onAddItem, scopeTagIds, teamMembers = [], onCreateTag, onCreatePersonTag,
  showIntroCallout, onDismissIntroCallout,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  // Tracks rows mid-action so a second click before the optimistic removal
  // re-renders can't fire the same add/dismiss twice.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // Pass null layoutConfig — we don't need CoS target lists here, just the suggestions
  const {
    suggestions, loading, refreshing, dismiss, refresh,
    addToList,
  } = useMeetingSuggestions({
    userId,
    layoutConfig: null as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    members,
    onAddToList: async (tagIds: string[], title: string) => {
      await onAddItem(title, 'task', tagIds);
    },
  });

  const health = useIntegrationHealth();

  const withBusyGuard = (id: string, run: () => Promise<void>) => {
    if (busyIds.has(id)) return;
    setBusyIds(prev => new Set(prev).add(id));
    void run();
  };

  const destinationTags = tags.filter(t => DESTINATION_TYPES.has(t.type) && !t.parent_id);

  const recommendedTag = (s: MeetingSuggestion) => s.tag_suggestions?.[0];

  // Viewing a specific project/folder: only surface suggestions tagged for it.
  const scopedSuggestions = scopeTagIds?.length
    ? suggestions.filter(s => s.tag_suggestions?.some(ts => scopeTagIds.includes(ts.tag_id)))
    : suggestions;

  if (loading || health.loading) return null;

  // Agent is on but integrations aren't connected — show a nudge instead of silence.
  if (scopedSuggestions.length === 0 && health.agentEnabled) {
    const missingGoogle = !health.googleConnected || !health.gmailScopeGranted;
    const missingSlack = !health.slackConnected;
    const missingZoom = !health.zoomConnected || health.zoomReauthRequired;
    if (missingGoogle || missingSlack || missingZoom) {
      const missing: string[] = [];
      if (missingGoogle) missing.push('Gmail');
      if (missingSlack) missing.push('Slack');
      if (missingZoom) missing.push(health.zoomReauthRequired ? 'Zoom (reconnect needed)' : 'Zoom');
      return (
        <div className="mx-3 sm:mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <WifiOff className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
            <p className="text-xs font-medium text-red-800">
              {missing.join(' and ')} not connected —{' '}
              <span className="font-normal text-red-700">
                the Agent can't mine your inbox yet.{' '}
              </span>
              <a
                href="/settings?section=calendar-sync"
                className="font-semibold underline text-red-800 hover:text-red-900"
              >
                Connect in Settings
              </a>
            </p>
          </div>
        </div>
      );
    }
  }

  if (scopedSuggestions.length === 0) return null;

  const MEETING_TYPES = new Set(['meeting', 'one_on_one', 'recurring_meeting', 'group_meeting']);
  const hasEmail = scopedSuggestions.some(s => s.source_type === 'email');
  const hasSlack = scopedSuggestions.some(s => s.source_type === 'slack');
  const hasMeetings = scopedSuggestions.some(s => MEETING_TYPES.has(s.source_type ?? ''));
  const allOneOnOne = scopedSuggestions.every(s => s.source_type === 'one_on_one');

  const sources: string[] = [];
  if (hasMeetings) sources.push(allOneOnOne ? '1:1s' : 'meetings');
  if (hasEmail) sources.push('email');
  if (hasSlack) sources.push('Slack');
  const panelTitle = sources.length > 0
    ? `Suggested from your ${sources.join(', ')}`
    : 'Suggested for your inbox';

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
          {scopedSuggestions.length}
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

      {/* One-time explainer — only shown when the panel itself is visible */}
      {showIntroCallout && onDismissIntroCallout && (
        <AutoSyncIntroCallout onDismiss={onDismissIntroCallout} />
      )}

      {/* Rows */}
      <div className="space-y-2">
        {(expanded ? scopedSuggestions : scopedSuggestions.slice(0, COLLAPSED_COUNT)).map(s => {
          const seed = s.memberName ?? s.source ?? s.id;
          const rec = recommendedTag(s);
          const busy = busyIds.has(s.id);
          return (
            <div
              key={s.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 transition-opacity',
                busy && 'opacity-50 pointer-events-none'
              )}
            >
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dotColor(seed))} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{s.title}</p>
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="truncate text-xs text-white/60">{provenance(s)}</p>
                  {s.source_url && (
                    <a
                      href={s.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-white/40 hover:text-white/80 transition-colors"
                      title="Open source"
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Primary: add to the recommended tag, if the AI found a genuine match. */}
              <Button
                size="sm"
                disabled={busy}
                onClick={() => withBusyGuard(s.id, () => addToList(s.id, rec ? [rec.tag_id] : []))}
                className="h-8 shrink-0 gap-1.5 bg-white/20 px-3 text-white hover:bg-white/30 border-0 max-w-[200px]"
                title={rec ? rec.reason : undefined}
              >
                {rec ? (
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: rec.color }} />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                <span className="truncate">{rec ? `Add to ${rec.tag_name}` : 'Add to inbox'}</span>
              </Button>

              {/* Secondary: choose a different destination, create a new one, or tag a
                  colleague from your relationships who doesn't have a tag yet. */}
              <TagPickerDropdown
                allTags={destinationTags}
                itemTags={[]}
                onSelectTags={tagIds => withBusyGuard(s.id, () => addToList(s.id, tagIds))}
                onCreateTag={onCreateTag}
                teamMembers={teamMembers}
                onCreatePersonTag={onCreatePersonTag}
                topOptions={[{ key: 'none', label: 'No tag — inbox only', onSelect: () => withBusyGuard(s.id, () => addToList(s.id, [])), highlighted: !rec }]}
                renderTrigger={({ toggle }) => (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={toggle}
                    className="h-8 shrink-0 gap-1 border-white/30 bg-transparent px-2.5 text-white hover:bg-white/20 hover:text-white"
                    title="Add to a different tag"
                  >
                    Add to…
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                )}
              />

              <button
                onClick={() => withBusyGuard(s.id, () => dismiss(s.id))}
                disabled={busy}
                className="shrink-0 rounded-md p-1.5 text-white/50 hover:bg-white/15 hover:text-white transition-colors"
                aria-label="Dismiss suggestion"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {scopedSuggestions.length > COLLAPSED_COUNT && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            {expanded ? (
              <><ChevronUp className="h-3.5 w-3.5" />Show fewer</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5" />Show {scopedSuggestions.length - COLLAPSED_COUNT} more</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
