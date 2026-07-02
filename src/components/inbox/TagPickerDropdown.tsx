import { useState, useRef, useEffect, useMemo } from 'react';
import { Tag, ChevronRight, Plus, Folder, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InboxTag } from '@/types/inbox';
import type { TeamMember } from '@/hooks/useTeamMembers';

interface TagPickerDropdownProps {
  allTags: InboxTag[];
  itemTags: InboxTag[];
  onAddTag: (tagId: string) => void;
  onCreateTag?: (name: string, type: 'project' | 'folder') => Promise<InboxTag | null>;
  teamMembers?: TeamMember[];
  onCreatePersonTag?: (member: TeamMember) => Promise<InboxTag | null>;
}

const TYPE_ORDER: InboxTag['type'][] = ['urgency', 'project', 'person', 'folder', 'context', 'workstream'];
const TYPE_LABEL: Record<InboxTag['type'], string> = {
  urgency: 'Urgency', project: 'Project', person: 'Person',
  folder: 'Folder', context: 'Context', workstream: 'Workstream',
};

export function TagPickerDropdown({ allTags, itemTags, onAddTag, onCreateTag, teamMembers = [], onCreatePersonTag }: TagPickerDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expandedParent, setExpandedParent] = useState<string | null>(null);
  const [pickingType, setPickingType] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        setExpandedParent(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const itemTagIds = new Set(itemTags.map(t => t.id));

  // Parent tags: non-workstream, not already applied
  const parentTags = useMemo(() => {
    const q = query.toLowerCase();
    return allTags.filter(t => t.type !== 'workstream' && !itemTagIds.has(t.id) && (!q || t.name.toLowerCase().includes(q)));
  }, [allTags, itemTagIds, query]);

  // When a parent is expanded, show its workstreams
  const workstreamsFor = useMemo(() => {
    if (!expandedParent) return [];
    const q = query.toLowerCase();
    return allTags.filter(
      t => t.type === 'workstream' && t.parent_id === expandedParent && !itemTagIds.has(t.id) && (!q || t.name.toLowerCase().includes(q))
    );
  }, [allTags, expandedParent, itemTagIds, query]);

  // Group parent tags
  const grouped = useMemo(() => {
    const map = new Map<InboxTag['type'], InboxTag[]>();
    for (const t of parentTags) {
      if (!map.has(t.type)) map.set(t.type, []);
      map.get(t.type)!.push(t);
    }
    return TYPE_ORDER.filter(k => map.has(k)).map(k => ({ type: k, tags: map.get(k)! }));
  }, [parentTags]);

  // Team members not yet linked to a person inbox_tag (matched by member_id or name)
  const linkedMemberIds = new Set(allTags.filter(t => t.type === 'person' && t.member_id).map(t => t.member_id!));
  const linkedMemberNames = new Set(allTags.filter(t => t.type === 'person').map(t => t.name.toLowerCase()));
  const unlinkedMembers = useMemo(() => {
    const q = query.toLowerCase();
    return teamMembers.filter(m =>
      !linkedMemberIds.has(m.id) &&
      !linkedMemberNames.has(m.name.toLowerCase()) &&
      !itemTagIds.has(allTags.find(t => t.member_id === m.id)?.id ?? '') &&
      (!q || m.name.toLowerCase().includes(q))
    );
  }, [teamMembers, linkedMemberIds, linkedMemberNames, itemTagIds, allTags, query]);

  const hasResults = parentTags.length > 0 || unlinkedMembers.length > 0 || (expandedParent && workstreamsFor.length > 0);
  const canCreate = !!onCreateTag && query.trim() && !allTags.some(t => t.name.toLowerCase() === query.trim().toLowerCase());

  // Flat ordered list of selectable items for keyboard nav
  const flatOptions = useMemo(() => {
    if (expandedParent) return workstreamsFor.map(t => ({ kind: 'tag' as const, tag: t }));
    return [
      ...parentTags.map(t => ({ kind: 'tag' as const, tag: t })),
      ...unlinkedMembers.map(m => ({ kind: 'member' as const, member: m })),
    ];
  }, [expandedParent, parentTags, workstreamsFor, unlinkedMembers]);

  const select = (tagId: string) => {
    onAddTag(tagId);
    setQuery('');
    setOpen(false);
    setExpandedParent(null);
    setPickingType(false);
  };

  const selectMember = async (member: TeamMember) => {
    if (!onCreatePersonTag) return;
    const tag = await onCreatePersonTag(member);
    if (tag) select(tag.id);
  };

  const handleCreate = async (type: 'project' | 'folder') => {
    if (!onCreateTag || !query.trim()) return;
    const tag = await onCreateTag(query.trim(), type);
    if (tag) select(tag.id);
  };

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed text-[10px] transition-colors',
          open
            ? 'border-red-400 bg-red-50 text-red-500'
            : 'border-red-300 text-red-400 hover:border-red-400 hover:text-red-500 hover:bg-red-50',
        )}
      >
        <Tag className="h-2.5 w-2.5" />
        Tag
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-56 flex flex-col"
          style={{ maxHeight: 280 }}
        >
          {/* Search */}
          <div className="px-3 pt-2 pb-1 border-b border-gray-100">
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setExpandedParent(null); setPickingType(false); setActiveIdx(0); }}
              placeholder="Search tags…"
              className="w-full text-xs outline-none placeholder-gray-400"
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'Escape') { setOpen(false); setQuery(''); return; }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveIdx(i => Math.min(i + 1, flatOptions.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveIdx(i => Math.max(0, i - 1));
                  return;
                }
                if (e.key === 'Tab' || e.key === 'Enter') {
                  if (flatOptions.length > 0) {
                    e.preventDefault();
                    const opt = flatOptions[Math.min(activeIdx, flatOptions.length - 1)];
                    if (opt.kind === 'tag') select(opt.tag.id);
                    else selectMember(opt.member);
                  } else if (e.key === 'Enter' && canCreate && !pickingType) {
                    setPickingType(true);
                  }
                }
              }}
            />
          </div>

          <div className="overflow-y-auto flex-1 py-1">
            {expandedParent ? (
              /* Workstream drill-down view */
              <>
                <button
                  onClick={() => setExpandedParent(null)}
                  className="w-full text-left px-3 py-1 text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1"
                >
                  ← back
                </button>
                {workstreamsFor.length > 0 ? workstreamsFor.map((ws, i) => (
                  <button
                    key={ws.id}
                    onClick={() => select(ws.id)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={cn('w-full text-left px-3 py-1.5 text-xs flex items-center gap-2', i === activeIdx ? 'bg-gray-100' : 'hover:bg-gray-50')}
                  >
                    <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ws.color }} />
                    {ws.name}
                  </button>
                )) : (
                  <p className="px-3 py-2 text-xs text-gray-400">No workstreams yet</p>
                )}
              </>
            ) : (
              /* Normal grouped view */
              <>
                {grouped.map(({ type, tags }) => (
                  <div key={type}>
                    <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                      {TYPE_LABEL[type]}
                    </p>
                    {tags.map(tag => {
                      const hasWorkstreams = allTags.some(t => t.type === 'workstream' && t.parent_id === tag.id);
                      const flatIdx = flatOptions.findIndex(o => o.kind === 'tag' && o.tag.id === tag.id);
                      const isActive = flatIdx === activeIdx;
                      return (
                        <div key={tag.id} className="flex items-center">
                          <button
                            onClick={() => select(tag.id)}
                            onMouseEnter={() => setActiveIdx(flatIdx)}
                            className={cn('flex-1 text-left px-3 py-1.5 text-xs flex items-center gap-2', isActive ? 'bg-gray-100' : 'hover:bg-gray-50')}
                          >
                            <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                            {tag.name}
                          </button>
                          {hasWorkstreams && (
                            <button
                              onClick={e => { e.stopPropagation(); setExpandedParent(tag.id); }}
                              className="pr-2 py-1.5 text-gray-300 hover:text-gray-500"
                              title="View workstreams"
                            >
                              <ChevronRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Unlinked team members */}
                {unlinkedMembers.length > 0 && (
                  <div>
                    <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                      People
                    </p>
                    {unlinkedMembers.map(m => {
                      const flatIdx = flatOptions.findIndex(o => o.kind === 'member' && o.member.id === m.id);
                      const isActive = flatIdx === activeIdx;
                      return (
                        <button
                          key={m.id}
                          onClick={() => selectMember(m)}
                          onMouseEnter={() => setActiveIdx(flatIdx)}
                          className={cn('w-full text-left px-3 py-1.5 text-xs flex items-center gap-2', isActive ? 'bg-gray-100' : 'hover:bg-gray-50')}
                        >
                          <span className="h-5 w-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                            {m.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="flex-1 truncate">{m.name}</span>
                          <span className="text-[10px] text-gray-300 truncate max-w-[80px]">{m.role}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!hasResults && !canCreate && (
                  <p className="px-3 py-2 text-xs text-gray-400">No tags found</p>
                )}

                {canCreate && !pickingType && (
                  <button
                    onClick={() => setPickingType(true)}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Plus className="h-3 w-3" />
                    Create "{query.trim()}"
                  </button>
                )}

                {canCreate && pickingType && (
                  <div className="border-t border-gray-100 pt-1">
                    <p className="px-3 py-1 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                      Create "{query.trim()}" as…
                    </p>
                    <button
                      onClick={() => handleCreate('project')}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
                    >
                      <LayoutGrid className="h-3.5 w-3.5 text-gray-400" />
                      Project
                    </button>
                    <button
                      onClick={() => handleCreate('folder')}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Folder className="h-3.5 w-3.5 text-gray-400" />
                      Folder
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
