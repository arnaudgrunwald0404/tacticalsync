import { useState, useEffect, useRef } from 'react';
import { Bot, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface CosMember {
  id: string;
  name: string;
  email: string;
  role: string | null;
  relationship_type: string;
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

export function DelegateDropdown({ userId, onSelect, onClose }: DelegateDropdownProps) {
  const [members, setMembers] = useState<CosMember[]>([]);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from('cos_team_members')
      .select('id, name, email, role, relationship_type')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (data) setMembers(data as unknown as CosMember[]);
      });
  }, [userId]);

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

  const MemberRow = ({ m }: { m: CosMember }) => (
    <button
      key={m.id}
      onClick={() => onSelect({ type: 'person', member: m })}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 transition-colors rounded-md"
    >
      <span className="h-5 w-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
        {m.name.charAt(0).toUpperCase()}
      </span>
      <span className="truncate text-gray-700">{m.name}</span>
    </button>
  );

  const Section = ({ label, items }: { label: string; items: CosMember[] }) =>
    items.length === 0 ? null : (
      <div>
        <p className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-gray-400 font-medium">{label}</p>
        {items.map(m => <MemberRow key={m.id} m={m} />)}
      </div>
    );

  return (
    <div
      ref={ref}
      className="absolute top-full mt-1.5 left-0 w-56 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden z-[200]"
    >
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

      <div className="max-h-60 overflow-y-auto p-1.5">
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
