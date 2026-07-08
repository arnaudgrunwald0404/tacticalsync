import { Info, ArrowLeft, Loader2, CheckSquare } from 'lucide-react';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/dateUtils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { usePersonPage } from '@/hooks/usePersonPage';
import { useRelationshipTopics, useForgottenCommitments } from '@/hooks/useRelationshipTopics';
import { PersonContextWidget } from './PersonContextWidget';
import { cn } from '@/lib/utils';
import type { InboxItem } from '@/types/inbox';

interface PersonPageProps {
  userId: string | null;
  memberId: string;
  onBack: () => void;
  onOpenItem?: (item: InboxItem) => void;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Small info-icon tooltip, matching PLAN §7a.2's "one-line, plain-language,
 *  reachable via an info icon, not a modal" guidance. */
function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-gray-300 hover:text-gray-500 transition-colors" aria-label="What is this?">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function SectionHeader({ title, tooltip, count }: { title: string; tooltip?: string; count?: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{title}</h3>
      {typeof count === 'number' && count > 0 && (
        <span className="text-[10px] font-semibold text-white bg-slate-500 rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
          {count}
        </span>
      )}
      {tooltip && <InfoTip text={tooltip} />}
    </div>
  );
}

/** Empty state that names the action that fills the section in, per
 *  PLAN_idea7_relationship_memory.md §7a.1 — never a bare "No data". */
function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-400 italic py-1">{children}</p>;
}

export function PersonPage({ userId, memberId, onBack, onOpenItem }: PersonPageProps) {
  const { member, personTag, openItems, relationshipDoc, prepHistory, loading, notFound, isColdStart } =
    usePersonPage(userId, memberId);
  const { topics, loading: topicsLoading } = useRelationshipTopics(memberId);
  const { commitments, loading: commitmentsLoading } = useForgottenCommitments(memberId);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
      </div>
    );
  }

  if (notFound || !member) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
        <p className="text-sm font-medium text-gray-700">Person not found</p>
        <p className="text-xs text-gray-400">This person may have been removed, or you don't have access.</p>
        <button onClick={onBack} className="mt-2 text-xs text-indigo-600 hover:underline">
          Back to inbox
        </button>
      </div>
    );
  }

  const color = personTag?.color ?? '#6366f1';

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-white rounded-xl">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
          aria-label="Back to inbox"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span
          className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {initials(member.name)}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 truncate">{member.name}</h2>
          <p className="text-xs text-gray-500 truncate">
            {member.role}
            {member.last_1on1_date && ` · Last 1:1 ${format(parseLocalDate(member.last_1on1_date), 'MMM d')}`}
          </p>
        </div>
      </div>

      {/* Cold-start banner (§7a.1) */}
      {isColdStart && (
        <div className="mx-5 mt-4 rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3">
          <p className="text-sm font-medium text-indigo-900">This page is just getting started.</p>
          <p className="text-xs text-indigo-700 mt-0.5">
            As you tag items, take 1:1 notes, and meet with {member.name}, this page fills in
            automatically — recurring topics, open commitments, and a running brief. Nothing to do
            right now except keep using your inbox and 1:1 prep as normal.
          </p>
        </div>
      )}

      <div className="flex-1 px-5 py-4 space-y-6">
        {/* Open items both directions */}
        <section>
          <SectionHeader title="Open items" count={openItems.length} />
          {openItems.length === 0 ? (
            <EmptyHint>No open items with {member.name} yet. Tag a task or note with their name and it'll show up here.</EmptyHint>
          ) : (
            <div className="space-y-1">
              {openItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => onOpenItem?.(item)}
                  className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors group"
                >
                  <CheckSquare className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                  <span className="text-sm text-gray-700 truncate group-hover:text-gray-900">{item.text}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Forgotten / overdue commitments */}
        <section>
          <SectionHeader title="Overdue commitments" count={commitments.length} />
          {commitmentsLoading ? (
            <EmptyHint>Loading…</EmptyHint>
          ) : commitments.length === 0 ? (
            <EmptyHint>Nothing overdue. You're caught up with {member.name}.</EmptyHint>
          ) : (
            <div className="space-y-1">
              {commitments.map(c => (
                <div key={c.id} className="flex items-center gap-2 px-2 py-1.5">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full flex-shrink-0',
                      c.urgency === 'critical' ? 'bg-red-500' : c.urgency === 'warning' ? 'bg-amber-500' : 'bg-gray-300',
                    )}
                  />
                  <span className="text-sm text-gray-700 truncate">{c.text}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{c.days_pending}d</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Topic map */}
        <section>
          <SectionHeader
            title="Recurring topics"
            count={topics.length}
            tooltip="Topics extracted from your 1:1 preps and prior notes with this person, tracked over time."
          />
          {topicsLoading ? (
            <EmptyHint>Loading…</EmptyHint>
          ) : topics.length === 0 ? (
            <EmptyHint>
              Recurring themes will appear here once you've had a couple of tagged conversations or 1:1s with {member.name}.
            </EmptyHint>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {topics.map(t => (
                <span
                  key={t.id}
                  className={cn(
                    'text-xs px-2 py-1 rounded-full border',
                    t.status === 'resolved' ? 'bg-green-50 text-green-700 border-green-200' :
                    t.status === 'stale' ? 'bg-gray-50 text-gray-400 border-gray-200' :
                    'bg-slate-50 text-slate-700 border-slate-200',
                  )}
                  title={`Mentioned ${t.mention_count}x · last ${t.last_mentioned_at}`}
                >
                  {t.topic}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Rolling relationship brief */}
        <section>
          <SectionHeader
            title="Relationship summary"
            tooltip="An AI-maintained running summary, updated automatically as new 1:1 preps and notes come in."
          />
          {relationshipDoc?.content ? (
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3">
              {relationshipDoc.content}
            </div>
          ) : (
            <EmptyHint>
              {member.name}'s relationship summary builds itself after your first 1:1 prep or
              Zoom-recorded conversation — check back after your next meeting.
            </EmptyHint>
          )}
        </section>

        {/* 1:1 prep history */}
        <section>
          <SectionHeader title="1:1 prep history" count={prepHistory.length} />
          {prepHistory.length === 0 ? (
            <EmptyHint>Prep notes from your 1:1s with {member.name} will show up here.</EmptyHint>
          ) : (
            <div className="space-y-2">
              {prepHistory.map(p => (
                <details key={p.id} className="group">
                  <summary className="text-sm text-gray-700 cursor-pointer hover:text-gray-900 list-none flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-mono">{p.prep_date}</span>
                    <span className="text-gray-300 group-open:hidden">▸</span>
                    <span className="hidden text-gray-300 group-open:inline">▾</span>
                  </summary>
                  <div className="mt-1 ml-14 text-xs text-gray-500 whitespace-pre-wrap">{p.content}</div>
                </details>
              ))}
            </div>
          )}
        </section>

        {/* Accountabilities + manual discussion topics — existing widget, reused as-is */}
        <section className="-mx-5">
          <PersonContextWidget userId={userId} memberId={memberId} memberName={member.name} color={color} />
        </section>
      </div>
    </div>
  );
}
