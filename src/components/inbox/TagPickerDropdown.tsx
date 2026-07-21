import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Tag, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InboxTag } from '@/types/inbox';
import type { TeamMember } from '@/hooks/useTeamMembers';

/** A fixed option pinned above the column grid (e.g. "No tag — inbox only"). */
export interface TagPickerTopOption {
  key: string;
  label: string;
  onSelect: () => void;
  highlighted?: boolean;
}

interface TagPickerDropdownProps {
  allTags: InboxTag[];
  itemTags: InboxTag[];
  /** Called with one id for a plain click, or several once "Save" is pressed
   *  after a multi-select (Shift/Cmd-click) session. */
  onSelectTags: (tagIds: string[]) => void | Promise<void>;
  onCreateTag?: (name: string, type: 'project' | 'folder') => Promise<InboxTag | null>;
  teamMembers?: TeamMember[];
  onCreatePersonTag?: (member: TeamMember) => Promise<InboxTag | null>;
  /** Extra fixed choices shown above the columns when the search box is empty. */
  topOptions?: TagPickerTopOption[];
  /** Custom trigger element. Defaults to the dashed "Tag" pill. */
  renderTrigger?: (state: { open: boolean; toggle: () => void }) => React.ReactNode;
}

function isMultiClick(e: React.MouseEvent): boolean {
  return e.shiftKey || e.metaKey || e.ctrlKey;
}

function TagRow({ tag, selected, onClick }: { tag: InboxTag; selected: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 rounded',
        selected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50',
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
      <span className="flex-1 truncate">{tag.name}</span>
      {selected && <Check className="h-3 w-3 flex-shrink-0 text-blue-500" />}
    </button>
  );
}

function MemberRow({ member, selected, onClick }: { member: TeamMember; selected: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 rounded',
        selected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50',
      )}
    >
      <span className="h-5 w-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
        {member.name.charAt(0).toUpperCase()}
      </span>
      <span className="flex-1 truncate">{member.name}</span>
      {selected && <Check className="h-3 w-3 flex-shrink-0 text-blue-500" />}
    </button>
  );
}

export function TagPickerDropdown({
  allTags, itemTags, onSelectTags, onCreateTag, teamMembers = [], onCreatePersonTag, topOptions = [], renderTrigger,
}: TagPickerDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isMultiActive = selectedTagIds.size > 0 || selectedMemberIds.size > 0;

  const resetAndClose = () => {
    setOpen(false);
    setQuery('');
    setSelectedTagIds(new Set());
    setSelectedMemberIds(new Set());
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      resetAndClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const recomputePosition = useCallback(() => {
    const trigger = ref.current;
    const dropdownEl = dropdownRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const dropdownWidth = dropdownEl?.offsetWidth ?? 460;
    const dropdownHeight = dropdownEl?.offsetHeight ?? 360;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Vertical: prefer below the trigger, flip above if there isn't room and above has more space.
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    let top = spaceBelow >= dropdownHeight + margin || spaceBelow >= spaceAbove
      ? rect.bottom + 4
      : rect.top - dropdownHeight - 4;
    top = Math.max(margin, Math.min(top, viewportHeight - dropdownHeight - margin));

    // Horizontal: prefer aligning to the trigger's left edge, flip to the right edge if it would overflow.
    let left = rect.left + dropdownWidth + margin <= viewportWidth
      ? rect.left
      : rect.right - dropdownWidth;
    left = Math.max(margin, Math.min(left, viewportWidth - dropdownWidth - margin));

    setCoords({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    recomputePosition();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, selectedTagIds, selectedMemberIds]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', recomputePosition);
    window.addEventListener('scroll', recomputePosition, true);
    return () => {
      window.removeEventListener('resize', recomputePosition);
      window.removeEventListener('scroll', recomputePosition, true);
    };
  }, [open, recomputePosition]);

  const itemTagIds = new Set(itemTags.map(t => t.id));
  const q = query.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);

  const projectTags = useMemo(
    () => allTags.filter(t => t.type === 'project' && !itemTagIds.has(t.id) && matches(t.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTags, itemTags, q],
  );
  const folderTags = useMemo(
    () => allTags.filter(t => t.type === 'folder' && !itemTagIds.has(t.id) && matches(t.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTags, itemTags, q],
  );
  const personTags = useMemo(
    () => allTags.filter(t => t.type === 'person' && !itemTagIds.has(t.id) && matches(t.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTags, itemTags, q],
  );

  // Team members not yet linked to a person inbox_tag (matched by member_id or name)
  const linkedMemberIds = new Set(allTags.filter(t => t.type === 'person' && t.member_id).map(t => t.member_id!));
  const linkedMemberNames = new Set(allTags.filter(t => t.type === 'person').map(t => t.name.toLowerCase()));
  const unlinkedMembers = useMemo(() => teamMembers.filter(m =>
    !linkedMemberIds.has(m.id) && !linkedMemberNames.has(m.name.toLowerCase()) && matches(m.name)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [teamMembers, linkedMemberIds, linkedMemberNames, q]);

  const nameTaken = (type: 'project' | 'folder') =>
    allTags.some(t => t.type === type && t.name.toLowerCase() === q);
  const canCreateProject = !!onCreateTag && !!q && !nameTaken('project');
  const canCreateFolder = !!onCreateTag && !!q && !nameTaken('folder');

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId); else next.add(tagId);
      return next;
    });
  };

  const toggleMember = (memberId: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId); else next.add(memberId);
      return next;
    });
  };

  const applyAndClose = (tagIds: string[]) => {
    if (tagIds.length > 0) onSelectTags(tagIds);
    resetAndClose();
  };

  const handleTagClick = (e: React.MouseEvent, tagId: string) => {
    if (isMultiActive || isMultiClick(e)) toggleTag(tagId);
    else applyAndClose([tagId]);
  };

  const handleMemberClick = async (e: React.MouseEvent, member: TeamMember) => {
    if (isMultiActive || isMultiClick(e)) { toggleMember(member.id); return; }
    if (!onCreatePersonTag) return;
    const tag = await onCreatePersonTag(member);
    if (tag) applyAndClose([tag.id]);
  };

  const handleCreate = async (type: 'project' | 'folder') => {
    if (!onCreateTag || !query.trim()) return;
    const tag = await onCreateTag(query.trim(), type);
    if (!tag) return;
    if (isMultiActive) {
      setSelectedTagIds(prev => new Set(prev).add(tag.id));
      setQuery('');
    } else {
      applyAndClose([tag.id]);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const memberTags = await Promise.all(
        [...selectedMemberIds].map(id => {
          const member = teamMembers.find(m => m.id === id);
          return member && onCreatePersonTag ? onCreatePersonTag(member) : Promise.resolve(null);
        }),
      );
      const ids = [
        ...selectedTagIds,
        ...memberTags.filter((t): t is InboxTag => !!t).map(t => t.id),
      ];
      if (ids.length > 0) await onSelectTags(ids);
    } finally {
      setSaving(false);
      resetAndClose();
    }
  };

  const toggle = () => setOpen(o => !o);
  const selectedCount = selectedTagIds.size + selectedMemberIds.size;

  return (
    <div ref={ref} className="relative inline-flex">
      {renderTrigger ? (
        <span onClick={e => e.stopPropagation()}>{renderTrigger({ open, toggle })}</span>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); toggle(); }}
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
      )}

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-[460px] max-w-[calc(100vw-16px)] flex flex-col"
          style={coords ? { top: coords.top, left: coords.left } : { top: -9999, left: -9999, visibility: 'hidden' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Search */}
          <div className="px-3 pt-2 pb-1 border-b border-gray-100">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search projects, folders, people…"
              className="w-full text-xs outline-none placeholder-gray-400"
              onKeyDown={e => { if (e.key === 'Escape') resetAndClose(); }}
            />
          </div>

          {/* Fixed top options (e.g. "No tag — inbox only") */}
          {!q && topOptions.length > 0 && (
            <div className="border-b border-gray-100 py-1">
              {topOptions.map(o => (
                <button
                  key={o.key}
                  onClick={() => { o.onSelect(); resetAndClose(); }}
                  className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50', o.highlighted && 'font-semibold')}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          {/* Three columns — overflow-x-auto so the People column is reachable on narrow mobile screens */}
          <div className="flex divide-x divide-gray-100 overflow-x-auto">
            {/* Projects */}
            <div className="flex flex-col flex-1 min-w-[140px] flex-shrink-0">
              <p className="px-2.5 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">Projects</p>
              <div className="overflow-y-auto px-1" style={{ maxHeight: 200 }}>
                {projectTags.length > 0 ? projectTags.map(tag => (
                  <TagRow key={tag.id} tag={tag} selected={selectedTagIds.has(tag.id)} onClick={e => handleTagClick(e, tag.id)} />
                )) : (
                  <p className="px-1.5 py-2 text-[11px] text-gray-300">No matches</p>
                )}
              </div>
              {canCreateProject && (
                <button
                  onClick={() => handleCreate('project')}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-gray-500 hover:bg-gray-50 border-t border-gray-100"
                >
                  <Plus className="h-3 w-3" />
                  Create "{query.trim()}"
                </button>
              )}
            </div>

            {/* Folders */}
            <div className="flex flex-col flex-1 min-w-[140px] flex-shrink-0">
              <p className="px-2.5 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">Folders</p>
              <div className="overflow-y-auto px-1" style={{ maxHeight: 200 }}>
                {folderTags.length > 0 ? folderTags.map(tag => (
                  <TagRow key={tag.id} tag={tag} selected={selectedTagIds.has(tag.id)} onClick={e => handleTagClick(e, tag.id)} />
                )) : (
                  <p className="px-1.5 py-2 text-[11px] text-gray-300">No matches</p>
                )}
              </div>
              {canCreateFolder && (
                <button
                  onClick={() => handleCreate('folder')}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-gray-500 hover:bg-gray-50 border-t border-gray-100"
                >
                  <Plus className="h-3 w-3" />
                  Create "{query.trim()}"
                </button>
              )}
            </div>

            {/* People */}
            <div className="flex flex-col flex-1 min-w-[140px] flex-shrink-0">
              <p className="px-2.5 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">People</p>
              <div className="overflow-y-auto px-1" style={{ maxHeight: 200 }}>
                {personTags.map(tag => (
                  <TagRow key={tag.id} tag={tag} selected={selectedTagIds.has(tag.id)} onClick={e => handleTagClick(e, tag.id)} />
                ))}
                {unlinkedMembers.map(m => (
                  <MemberRow key={m.id} member={m} selected={selectedMemberIds.has(m.id)} onClick={e => handleMemberClick(e, m)} />
                ))}
                {personTags.length === 0 && unlinkedMembers.length === 0 && (
                  <p className="px-1.5 py-2 text-[11px] text-gray-300">No matches</p>
                )}
              </div>
            </div>
          </div>

          {/* Multi-select footer */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 bg-gray-50 rounded-b-lg">
              <span className="text-[11px] text-gray-500 flex-1">{selectedCount} selected</span>
              <button
                onClick={() => { setSelectedTagIds(new Set()); setSelectedMemberIds(new Set()); }}
                className="text-[11px] text-gray-500 hover:text-gray-700 px-2 py-1"
              >
                Clear
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-[11px] font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50 rounded px-3 py-1"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}

          {/* Hint for how multi-select works */}
          {selectedCount === 0 && (
            <p className="px-3 py-1.5 text-[10px] text-gray-300 border-t border-gray-100">
              Shift or ⌘/Ctrl-click to select several, then Save
            </p>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
