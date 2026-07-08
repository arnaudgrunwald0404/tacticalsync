import { Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import type { PersonBriefPayload } from '@/types/inbox';

/**
 * Renders a pre-1:1 person brief (Idea #7: Relationship memory) inside the
 * item drawer / assistant panel, wherever a brief_item's agent_payload.person_brief
 * is present. See PLAN_idea7_relationship_memory.md §3.3 and §7a.2.
 *
 * Deliberately avoids "AI-detected"/"algorithm"/confidence-score language —
 * the tooltips describe *what it looked at*, not *how the model works*
 * (§7a.2's explicit ask), and each talking point shows a "from:" caption
 * instead of requiring a hover to explain its source.
 */

function SectionLabel({ text, tooltip }: { text: string; tooltip: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">{text}</p>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-gray-300 hover:text-gray-500 transition-colors" aria-label={`About ${text}`}>
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

interface PersonBriefDetailProps {
  brief: PersonBriefPayload;
}

export function PersonBriefDetail({ brief }: PersonBriefDetailProps) {
  const hasAnything =
    brief.open_items_mine.length > 0 || brief.open_items_theirs.length > 0 ||
    brief.changes_since_last.length > 0 || brief.talking_points.length > 0;

  if (!hasAnything) {
    return (
      <p className="text-xs text-gray-400 italic">
        No prior history with {brief.member_name} yet — this may be an early 1:1.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {(brief.open_items_mine.length > 0 || brief.open_items_theirs.length > 0) && (
        <div className="space-y-1.5">
          <SectionLabel
            text="Open items"
            tooltip={`Tasks and notes tagged to ${brief.member_name} that are still open, on both sides.`}
          />
          <div className="space-y-1">
            {brief.open_items_mine.map((i, idx) => (
              <div key={`mine-${idx}`} className="flex items-start gap-1.5 text-sm text-gray-700">
                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded px-1 mt-0.5 flex-shrink-0">You</span>
                <span>{i.text}</span>
              </div>
            ))}
            {brief.open_items_theirs.map((i, idx) => (
              <div key={`theirs-${idx}`} className="flex items-start gap-1.5 text-sm text-gray-700">
                <span className="text-[10px] font-medium text-amber-600 bg-amber-50 rounded px-1 mt-0.5 flex-shrink-0">{brief.member_name.split(' ')[0]}</span>
                <span>{i.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {brief.changes_since_last.length > 0 && (
        <div className="space-y-1.5">
          <SectionLabel
            text="What changed since last time"
            tooltip={`Compares what's been tagged to ${brief.member_name} since your last 1:1 — new topics, closed items, and anything overdue.`}
          />
          <ul className="space-y-1">
            {brief.changes_since_last.map((c, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-start gap-1.5">
                <span className="text-gray-300 mt-0.5">•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.talking_points.length > 0 && (
        <div className="space-y-1.5">
          <SectionLabel
            text="Suggested talking points"
            tooltip="Pulled from open items, recent notes, and topics you've discussed — not a script, just a starting point."
          />
          <div className="space-y-2">
            {brief.talking_points.map((p, idx) => (
              <div key={idx} className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-sm text-gray-800">{p.text}</p>
                {p.from && <p className="text-[11px] text-gray-400 mt-0.5">from: {p.from}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
