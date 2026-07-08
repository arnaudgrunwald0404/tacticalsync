import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Bot, Search, Link2, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCosTeamMemberLinking } from '@/hooks/useCosTeamMemberLinking';

interface CosMember {
  id: string;
  name: string;
  email: string;
  role: string | null;
  relationship_type: string;
  linked_user_id: string | null;
  pendingInvite: { id: string; invited_email: string; created_at: string; expires_at: string } | null;
}

const RELATIONSHIP_ORDER = ['direct_report', 'skip_level'];

function groupMembers(members: CosMember[]) {
  const directReports = members.filter(m => m.relationship_type === 'direct_report');
  const skipLevel     = members.filter(m => m.relationship_type === 'skip_level');
  const others        = members.filter(m => !RELATIONSHIP_ORDER.includes(m.relationship_type));
  return { directReports, skipLevel, others };
}

interface DelegateDropdownProps {
  userId: string;
  onSelect: (target: { type: 'assistant' } | { type: 'person'; member: CosMember }) => void;
  onClose: () => void;
}

const COACH_MARK_KEY = 'inbox_delegate_dropdown_coachmark_seen';

export function DelegateDropdown({ userId, onSelect, onClose }: DelegateDropdownProps) {
  const [query, setQuery] = useState('');
  const [invitingMemberId, setInvitingMemberId] = useState<string | null>(null);
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);
  const [showCoachMark, setShowCoachMark] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reuses the same Phase 0 account-linking hook the Settings -> Connections
  // panel uses — "yourTeam" already carries linked_user_id + pendingInvite
  // per row, so this dropdown doesn't need its own linking-state fetch.
  const { yourTeam, sendInvite, loading: linkingLoading } = useCosTeamMemberLinking(userId);

  const members: CosMember[] = yourTeam.map(m => ({
    id: m.id,
    name: m.name,
    email: m.email ?? '',
    role: m.role,
    relationship_type: m.relationship_type,
    linked_user_id: m.linked_user_id,
    pendingInvite: m.pendingInvite,
  }));

  useEffect(() => {
    // One-time coach mark (PLAN §8.1A) — only worth showing once there's at
    // least one linked person to delegate to, otherwise it advertises a
    // capability the dropdown can't yet deliver on for this user.
    if (typeof window === 'undefined') return;
    const hasLinkedMember = members.some(m => m.linked_user_id);
    if (hasLinkedMember && !window.localStorage.getItem(COACH_MARK_KEY)) {
      setShowCoachMark(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yourTeam]);

  const dismissCoachMark = () => {
    window.localStorage.setItem(COACH_MARK_KEY, '1');
    setShowCoachMark(false);
  };

  // Focus search on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filtered = query
    ? members.filter(m => m.name.toLowerCase().includes(query.toLowerCase()) ||
        (m.email ?? '').toLowerCase().includes(query.toLowerCase()))
    : members;

  const { directReports, skipLevel, others } = groupMembers(filtered);

  const showAssistant = !query || 'assistant'.includes(query.toLowerCase());

  const handleSendInvite = async (member: CosMember) => {
    if (!member.email) return;
    setSendingInviteId(member.id);
    await sendInvite(member.id, member.email);
    setSendingInviteId(null);
    // Keep the popover open showing the new "Invite sent" state rather than
    // closing the whole dropdown — the manager may want to invite more than
    // one person in a row (PLAN §8.1B).
  };

  // Per PLAN §8.1B: a person who hasn't linked their account renders in a
  // visibly different (not hidden — the manager still thinks of them as a
  // team member), non-delegating state. Clicking opens an inline invite
  // panel instead of silently discarding the pick or attempting a
  // delegation that the edge function would just reject as `not_linked`.
  const MemberRow = ({ m }: { m: CosMember }) => {
    const isInviting = invitingMemberId === m.id;

    if (!m.linked_user_id) {
      return (
        <div key={m.id}>
          <button
            onClick={() => setInvitingMemberId(isInviting ? null : m.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 transition-colors rounded-md"
          >
            <span className="h-5 w-5 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
              {m.name.charAt(0).toUpperCase()}
            </span>
            <span className="truncate text-gray-500 flex-1">{m.name}</span>
            <span className="flex-shrink-0 text-[10px] text-gray-400">
              {m.pendingInvite
                ? `Invite sent ${formatDistanceToNow(new Date(m.pendingInvite.created_at), { addSuffix: true })}`
                : 'Not linked yet'}
            </span>
          </button>

          {isInviting && (
            <div className="mx-2 mb-1.5 p-2.5 rounded-md bg-gray-50 border border-gray-100 text-xs">
              <p className="font-medium text-gray-800 mb-1">
                {m.name.split(' ')[0]} hasn't linked their account yet
              </p>
              <p className="text-gray-500 mb-2 leading-snug">
                To delegate items to {m.name.split(' ')[0]}, they need to connect their TacticalSync login to your
                team list. Send them an invite — it takes 30 seconds on their end.
              </p>
              <p className="text-gray-400 mb-2 leading-snug italic">
                {m.name.split(' ')[0]} will get an email explaining what this means and can decline if they'd rather not.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSendInvite(m)}
                  disabled={sendingInviteId === m.id || !m.email}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-gray-900 text-white text-[11px] font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {sendingInviteId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  {m.pendingInvite ? 'Resend invite' : 'Send invite'}
                </button>
                <button
                  onClick={() => setInvitingMemberId(null)}
                  className="px-2 py-1 rounded text-[11px] text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Maybe later
                </button>
              </div>
              {!m.email && (
                <p className="text-red-500 mt-1.5">Add an email for {m.name} first (Settings → Connections).</p>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={m.id}
        onClick={() => onSelect({ type: 'person', member: m })}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 transition-colors rounded-md"
      >
        <span className="h-5 w-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
          {m.name.charAt(0).toUpperCase()}
        </span>
        <span className="truncate text-gray-700">{m.name}</span>
        <Link2 className="h-3 w-3 text-gray-300 ml-auto flex-shrink-0" />
      </button>
    );
  };

  const Section = ({ label, items }: { label: string; items: CosMember[] }) =>
    items.length === 0 ? null : (
      <div>
        <p className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-gray-400 font-medium">{label}</p>
        {items.map(m => <MemberRow key={m.id} m={m} />)}
      </div>
    );

  const noneLinked = !linkingLoading && members.length > 0 && members.every(m => !m.linked_user_id);

  return (
    <div
      ref={ref}
      className={cn(
        'absolute top-full mt-1.5 left-0 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden z-[200]',
        showCoachMark ? 'w-72' : 'w-64',
      )}
    >
      {/* One-time coach mark (PLAN §8.1A) */}
      {showCoachMark && (
        <div className="px-3 py-2.5 bg-violet-50 border-b border-violet-100">
          <p className="text-xs font-medium text-violet-900 mb-0.5">Delegate directly to your team</p>
          <p className="text-[11px] text-violet-700 leading-snug mb-1.5">
            Send this item to a teammate's inbox instead of doing it yourself. They'll see it, you'll see
            "Waiting on" them until it's done.
          </p>
          <button
            onClick={dismissCoachMark}
            className="text-[11px] font-medium text-violet-700 hover:text-violet-900 underline"
          >
            Got it
          </button>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <Search className="h-3 w-3 text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search…"
          className="flex-1 text-xs outline-none placeholder:text-gray-400"
        />
      </div>

      <div className="max-h-72 overflow-y-auto p-1.5">
        {/* Assistant — always first */}
        {showAssistant && (
          <button
            onClick={() => onSelect({ type: 'assistant' })}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-violet-50 transition-colors rounded-md group"
          >
            <span className="h-5 w-5 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center flex-shrink-0">
              <Bot className="h-3 w-3" />
            </span>
            <span className="text-sm font-medium text-gray-800 group-hover:text-violet-700">Assistant</span>
          </button>
        )}

        {showAssistant && filtered.length > 0 && (
          <div className="mx-2 my-1 border-t border-gray-100" />
        )}

        {/* Empty state: zero linked team members at all (PLAN §8.1C) */}
        {noneLinked && !query && (
          <div className="px-3 py-3 text-center">
            <p className="text-xs font-medium text-gray-700 mb-1">Delegate to your team</p>
            <p className="text-[11px] text-gray-400 leading-snug">
              None of your team members have linked their accounts yet. Once they do, you can send them items
              directly and track progress together. Click a name below to invite them.
            </p>
          </div>
        )}

        <Section label="Direct reports" items={directReports} />
        <Section label="Skip-level"     items={skipLevel} />
        <Section label="Others"         items={others} />

        {!showAssistant && filtered.length === 0 && (
          <p className="px-3 py-3 text-xs text-gray-400 text-center">No match</p>
        )}
      </div>
    </div>
  );
}
