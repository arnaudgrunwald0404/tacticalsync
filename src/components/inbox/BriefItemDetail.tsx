import { useState, useCallback, useRef } from 'react';
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors,
  closestCenter, DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns';
import { GripVertical, Pencil, X, Check, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';
import type { BriefPriority } from '@/types/inbox';

/** `briefDate` is a YYYY-MM-DD string — parse as local time (never `new Date(str)`
 *  directly) to avoid the UTC-midnight-shifts-a-day-back bug in western timezones. */
function formatBriefDate(briefDate: string, isWeekly: boolean): string {
  const date = parseLocalDate(briefDate);
  if (isNaN(date.getTime())) return briefDate;
  return isWeekly ? `Week of ${format(date, 'MMMM d')}` : format(date, 'EEEE, MMMM d');
}

const ORIGIN_BADGE: Record<string, { label: string; className: string }> = {
  cos:       { label: 'My Lists',    className: 'bg-indigo-100 text-indigo-600' },
  brief:     { label: 'New signal',  className: 'bg-amber-100 text-amber-600' },
  'cos+brief': { label: 'Boosted',   className: 'bg-emerald-100 text-emerald-600' },
};

const SOURCE_ICONS: Record<string, string> = {
  priorities: '📋', email: '📧', calendar: '📅', slack: '💬', dci_history: '🔄',
};

// ── Single draggable card ────────────────────────────────────────────────────

function PriorityCard({
  id, index, priority, isSelected,
  onEdit, onDelete,
}: {
  id: string;
  index: number;
  priority: BriefPriority;
  isSelected: boolean;
  onEdit: (text: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(priority.text);

  const commitEdit = () => {
    if (editText.trim()) onEdit(editText.trim());
    setEditing(false);
  };

  const badge = ORIGIN_BADGE[priority.origin] ?? ORIGIN_BADGE.cos;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative flex flex-col gap-2 rounded-lg border p-3 w-full bg-white transition-all select-none',
        isSelected
          ? 'border-gray-300 shadow-sm'
          : 'border-dashed border-gray-200 opacity-50',
        isDragging && 'opacity-30 shadow-lg',
      )}
    >
      {/* Rank badge */}
      <div className="flex items-center justify-between gap-1">
        <span className={cn(
          'h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0',
          isSelected ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400',
        )}>
          {index + 1}
        </span>
        <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full', badge.className)}>
          {badge.label}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="p-0.5 rounded text-gray-300 hover:text-gray-700 transition-colors"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-0.5 rounded text-gray-300 hover:text-red-500 transition-colors"
          >
            <X className="h-2.5 w-2.5" />
          </button>
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-200 hover:text-gray-400 transition-colors"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Text */}
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
              if (e.key === 'Escape') { setEditing(false); setEditText(priority.text); }
            }}
            onBlur={commitEdit}
            className="flex-1 text-xs outline-none border-b border-gray-300 bg-transparent pb-0.5"
          />
          <button onClick={commitEdit}><Check className="h-3 w-3 text-emerald-500" /></button>
        </div>
      ) : (
        <p className={cn('text-xs leading-snug', isSelected ? 'font-medium text-gray-800' : 'text-gray-400')}>
          {priority.text}
        </p>
      )}

      {/* Source + reasoning */}
      {priority.reasoning && (
        <p className="text-[10px] text-gray-400 leading-tight line-clamp-2">
          {SOURCE_ICONS[priority.source] ?? '•'} {priority.reasoning}
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface BriefItemDetailProps {
  priorities: BriefPriority[];
  briefDate: string;
  onSave: (priorities: BriefPriority[]) => Promise<void>;
  kind?: 'daily' | 'weekly';
}

export function BriefItemDetail({ priorities, briefDate, onSave, kind = 'daily' }: BriefItemDetailProps) {
  const isWeekly = kind === 'weekly';
  const [items, setItems] = useState<BriefPriority[]>(priorities);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newText, setNewText] = useState('');
  const newInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const ids = items.map((_, i) => `brief-${i}`);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    const reordered = arrayMove(items, oldIdx, newIdx);
    setItems(reordered);

    setSaving(true);
    await onSave(reordered);
    setSaving(false);
  }, [items, ids, onSave]);

  const editItem = useCallback(async (idx: number, text: string) => {
    const updated = items.map((p, i) => i === idx ? { ...p, text } : p);
    setItems(updated);
    setSaving(true);
    await onSave(updated);
    setSaving(false);
  }, [items, onSave]);

  const deleteItem = useCallback(async (idx: number) => {
    const updated = items.filter((_, i) => i !== idx);
    setItems(updated);
    setSaving(true);
    await onSave(updated);
    setSaving(false);
  }, [items, onSave]);

  const commitAdd = useCallback(async () => {
    const text = newText.trim();
    if (!text) { setAddingNew(false); setNewText(''); return; }
    const newPriority: BriefPriority = { text, source: 'priorities', origin: 'cos', reasoning: '' };
    const updated = [...items, newPriority];
    setItems(updated);
    setNewText('');
    setAddingNew(false);
    setSaving(true);
    await onSave(updated);
    setSaving(false);
  }, [newText, items, onSave]);

  const activeItem = activeId ? items[ids.indexOf(activeId)] : null;

  return (
    <div className="pb-3 pl-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
          {isWeekly ? "This Week's Priorities" : "Today's Priorities"}
        </span>
        <span className="text-[10px] text-gray-300">· drag to reorder · top 3 selected</span>
        {saving && <span className="text-[10px] text-gray-400 italic">saving…</span>}
        <span className="ml-auto text-[10px] text-gray-400">{formatBriefDate(briefDate, isWeekly)}</span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id as string)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {items.map((priority, idx) => (
              <div key={idx}>
                {idx === 3 && (
                  <div className="flex items-center gap-2 py-1 mb-1">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-[9px] text-gray-400 whitespace-nowrap">not in top 3</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                )}
                <PriorityCard
                  id={ids[idx]}
                  index={idx}
                  priority={priority}
                  isSelected={idx < 3}
                  onEdit={text => editItem(idx, text)}
                  onDelete={() => deleteItem(idx)}
                />
              </div>
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeItem && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-xl p-3 w-full opacity-90 text-xs font-medium text-gray-800">
              {activeItem.text}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {addingNew ? (
        <div className="flex items-center gap-1 px-1 py-1.5 border border-dashed border-gray-300 rounded-lg">
          <input
            ref={newInputRef}
            autoFocus
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitAdd(); }
              if (e.key === 'Escape') { setAddingNew(false); setNewText(''); }
            }}
            onBlur={commitAdd}
            placeholder="Add a priority…"
            className="flex-1 text-xs outline-none bg-transparent px-1 text-gray-800 placeholder:text-gray-300"
          />
          <button onClick={commitAdd}><Check className="h-3 w-3 text-emerald-500" /></button>
          <button onClick={() => { setAddingNew(false); setNewText(''); }}><X className="h-3 w-3 text-gray-300" /></button>
        </div>
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors px-1"
        >
          <Plus className="h-3 w-3" />
          Add a priority
        </button>
      )}

      <p className="text-[10px] text-gray-400">
        {isWeekly
          ? 'The top 3 cards are your priorities for the week · drag to reorder'
          : 'The top 3 cards are your daily priorities · drag to reorder'}
      </p>
    </div>
  );
}
