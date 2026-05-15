import React, { useState, useEffect } from 'react';
import { GripVertical, Save, Loader2, Plus, X } from 'lucide-react';
import {
  DndContext, DragEndEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, horizontalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  CosLayoutConfig, CosColumn, CosColumnSection, CosSectionType,
  DEFAULT_STATUS_OPTIONS, DEFAULT_LAYOUT_CONFIG,
  SECTION_TYPE_LABELS, isAutoType, resolveNewSectionLabel,
  totalWidthPct, adjustColumnCount, migrateOldSettings,
} from '@/types/cos';

// ── SortableSectionRow ────────────────────────────────────────────────────────

function SortableSectionRow({
  section, onUpdate, onRemove,
}: {
  section: CosColumnSection;
  onUpdate: (changes: Partial<CosColumnSection>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const auto = isAutoType(section.type);
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1.5">
      <button
        {...attributes} {...listeners}
        className="p-0.5 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
        tabIndex={-1}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <Switch
        checked={section.enabled}
        onCheckedChange={checked => onUpdate({ enabled: checked })}
        className="flex-shrink-0 scale-[0.8] origin-left"
      />
      {auto ? (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-xs text-muted-foreground truncate">{resolveNewSectionLabel(section)}</span>
          <Badge variant="secondary" className="text-[9px] px-1 py-0 font-normal flex-shrink-0 leading-tight">auto</Badge>
        </div>
      ) : (
        <Input
          value={section.label ?? ''}
          onChange={e => onUpdate({ label: e.target.value || null })}
          placeholder={SECTION_TYPE_LABELS[section.type] ?? 'Section name'}
          className="h-7 text-xs flex-1 min-w-0"
          disabled={!section.enabled}
        />
      )}
      <button
        onClick={onRemove}
        className="p-0.5 text-muted-foreground/40 hover:text-destructive flex-shrink-0"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── SectionTypeAdder ──────────────────────────────────────────────────────────

function SectionTypeAdder({ availableTypes, onAdd }: {
  availableTypes: CosSectionType[];
  onAdd: (type: CosSectionType) => void;
}) {
  const [value, setValue] = React.useState('');
  return (
    <Select value={value} onValueChange={t => { onAdd(t as CosSectionType); setValue(''); }}>
      <SelectTrigger className="h-8 text-xs mt-2 text-muted-foreground">
        <SelectValue placeholder="+ Add section" />
      </SelectTrigger>
      <SelectContent>
        {availableTypes.map(t => (
          <SelectItem key={t} value={t} className="text-xs">{SECTION_TYPE_LABELS[t]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── SortableColumnCard ────────────────────────────────────────────────────────

function SortableColumnCard({
  col, colIndex, availableTypes,
  onUpdateHeader, onUpdateWidth, onUpdateSection, onRemoveSection, onAddSection,
}: {
  col: CosColumn;
  colIndex: number;
  availableTypes: CosSectionType[];
  onUpdateHeader: (label: string) => void;
  onUpdateWidth: (pct: number) => void;
  onUpdateSection: (sectionId: string, changes: Partial<CosColumnSection>) => void;
  onRemoveSection: (sectionId: string) => void;
  onAddSection: (type: CosSectionType) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="space-y-3 rounded-lg border border-border/60 p-3 flex flex-col">
      <div className="flex items-center gap-1.5">
        <button
          {...attributes} {...listeners}
          className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
          tabIndex={-1}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Column {colIndex + 1}
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Label</label>
        <Input value={col.headerLabel} onChange={e => onUpdateHeader(e.target.value)} className="h-8 text-sm" placeholder={`Column ${colIndex + 1}`} />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Width %</label>
        <Input type="number" min={5} max={90} value={col.widthPct} onChange={e => onUpdateWidth(parseInt(e.target.value) || 0)} className="h-8 text-sm" />
      </div>

      <div className="flex-1 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {col.headerLabel || `Column ${colIndex + 1}`} — sections
        </p>
        <SortableContext items={col.sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {col.sections.map(section => (
              <SortableSectionRow
                key={section.id}
                section={section}
                onUpdate={changes => onUpdateSection(section.id, changes)}
                onRemove={() => onRemoveSection(section.id)}
              />
            ))}
          </div>
        </SortableContext>
        {availableTypes.length > 0 && (
          <SectionTypeAdder availableTypes={availableTypes} onAdd={onAddSection} />
        )}
      </div>
    </div>
  );
}

// ── CosSettingsPanel (main export) ───────────────────────────────────────────

export default function CosSettingsPanel() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Status options
  const [draft, setDraft] = useState<string[]>(DEFAULT_STATUS_OPTIONS);
  const [saving, setSaving] = useState(false);

  // Layout config
  const [draftLayout, setDraftLayout] = useState<CosLayoutConfig>(DEFAULT_LAYOUT_CONFIG);
  const [savingLayout, setSavingLayout] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from('cos_settings').select('*').eq('user_id', user.id).maybeSingle();
      if (data?.status_options) setDraft(data.status_options as string[]);
      const raw = data as Record<string, unknown> | null;
      if (raw?.layout_config) {
        setDraftLayout(raw.layout_config as CosLayoutConfig);
      } else if (raw) {
        setDraftLayout(migrateOldSettings(raw));
      }
      setLoading(false);
    }
    load();
  }, []);

  // ── Status helpers ──────────────────────────────────────────────────────────
  const update = (idx: number, val: string) => setDraft(prev => prev.map((s, i) => (i === idx ? val : s)));
  const remove = (idx: number) => setDraft(prev => prev.filter((_, i) => i !== idx));
  const addOption = () => setDraft(prev => [...prev, '']);

  const saveStatuses = async () => {
    if (!userId) return;
    const cleaned = draft.map(s => s.trim()).filter(Boolean);
    if (cleaned.length === 0) { toast({ title: 'Add at least one status option', variant: 'destructive' }); return; }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_settings').upsert(
      { user_id: userId, status_options: cleaned, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    setDraft(cleaned);
    setSaving(false);
    toast({ title: 'Status options saved' });
  };

  // ── Layout helpers ──────────────────────────────────────────────────────────
  const updateColumnHeader = (colId: string, headerLabel: string) =>
    setDraftLayout(prev => ({ ...prev, columns: prev.columns.map(c => c.id === colId ? { ...c, headerLabel } : c) }));

  const updateColumnWidth = (colId: string, widthPct: number) =>
    setDraftLayout(prev => ({ ...prev, columns: prev.columns.map(c => c.id === colId ? { ...c, widthPct } : c) }));

  const updateSection = (colId: string, sectionId: string, changes: Partial<CosColumnSection>) =>
    setDraftLayout(prev => ({
      ...prev,
      columns: prev.columns.map(c => c.id !== colId ? c : {
        ...c, sections: c.sections.map(s => s.id === sectionId ? { ...s, ...changes } : s),
      }),
    }));

  const removeSection = (colId: string, sectionId: string) =>
    setDraftLayout(prev => ({
      ...prev,
      columns: prev.columns.map(c => c.id !== colId ? c : {
        ...c, sections: c.sections.filter(s => s.id !== sectionId),
      }),
    }));

  const addSection = (colId: string, type: CosSectionType) => {
    const newId = type === 'custom' ? `custom_${crypto.randomUUID().slice(0, 8)}` : type;
    const newSection: CosColumnSection = { id: newId, type, label: type === 'custom' ? 'New Section' : null, enabled: true };
    setDraftLayout(prev => ({
      ...prev,
      columns: prev.columns.map(c => c.id !== colId ? c : { ...c, sections: [...c.sections, newSection] }),
    }));
  };

  const changeColumnCount = (newCount: 3 | 4) =>
    setDraftLayout(prev => adjustColumnCount(prev, newCount));

  const getAvailableTypes = (currentColId: string): CosSectionType[] => {
    const usedNonCustom = new Set<CosSectionType>();
    for (const col of draftLayout.columns) {
      for (const s of col.sections) {
        if (s.type !== 'custom') usedNonCustom.add(s.type);
      }
    }
    const allTypes: CosSectionType[] = [
      'now', 'this_week', 'next_week', 'this_month_auto', 'next_month_auto', 'next_quarter_auto', 'direct_reports', 'custom',
    ];
    const currentCol = draftLayout.columns.find(c => c.id === currentColId);
    const typesInThisCol = new Set(currentCol?.sections.map(s => s.type) ?? []);
    return allTypes
      .filter(t => t === 'custom' || !usedNonCustom.has(t))
      .filter(t => t === 'custom' || !typesInThisCol.has(t));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const activeId = active.id as string;
    const overId   = over.id   as string;

    if (draftLayout.columns.some(c => c.id === activeId)) {
      const oldIdx = draftLayout.columns.findIndex(c => c.id === activeId);
      const newIdx = draftLayout.columns.findIndex(c => c.id === overId);
      if (oldIdx !== -1 && newIdx !== -1)
        setDraftLayout(prev => ({ ...prev, columns: arrayMove(prev.columns, oldIdx, newIdx) }));
      return;
    }

    const sourceColIdx = draftLayout.columns.findIndex(c => c.sections.some(s => s.id === activeId));
    if (sourceColIdx === -1) return;
    let targetColIdx = draftLayout.columns.findIndex(c => c.sections.some(s => s.id === overId));
    if (targetColIdx === -1) targetColIdx = draftLayout.columns.findIndex(c => c.id === overId);
    if (targetColIdx === -1) return;

    setDraftLayout(prev => {
      const newColumns = prev.columns.map(c => ({ ...c, sections: [...c.sections] }));
      if (sourceColIdx === targetColIdx) {
        const col = newColumns[sourceColIdx];
        const oldIdx = col.sections.findIndex(s => s.id === activeId);
        const newIdx = col.sections.findIndex(s => s.id === overId);
        if (oldIdx !== -1 && newIdx !== -1)
          newColumns[sourceColIdx] = { ...col, sections: arrayMove(col.sections, oldIdx, newIdx) };
      } else {
        const sourceCol = newColumns[sourceColIdx];
        const targetCol = newColumns[targetColIdx];
        const sectionIdx = sourceCol.sections.findIndex(s => s.id === activeId);
        const [movedSection] = sourceCol.sections.splice(sectionIdx, 1);
        const overIdx = targetCol.sections.findIndex(s => s.id === overId);
        if (overIdx !== -1) targetCol.sections.splice(overIdx, 0, movedSection);
        else targetCol.sections.push(movedSection);
      }
      return { ...prev, columns: newColumns };
    });
  };

  const saveLayout = async () => {
    if (!userId) return;
    if (totalWidthPct(draftLayout.columns) !== 100) {
      toast({ title: `Column widths sum to ${totalWidthPct(draftLayout.columns)}% — must equal 100%`, variant: 'destructive' });
      return;
    }
    setSavingLayout(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_settings').upsert(
      { user_id: userId, layout_config: draftLayout, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    setSavingLayout(false);
    toast({ title: 'Layout settings saved' });
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-10">
      {/* ── Column Labels ──────────────────────────────────────────────────── */}
      <div className="space-y-5">
        <div className="max-w-lg">
          <h3 className="text-sm font-semibold">Column Labels</h3>
          <p className="text-xs text-muted-foreground mt-1">
            These labels appear as column headers in the canvas. Auto-labeled sections (months, quarter) compute their value from the calendar and cannot be renamed.
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Number of columns</p>
          <div className="flex gap-2">
            {([3, 4] as const).map(n => (
              <button
                key={n}
                onClick={() => changeColumnCount(n)}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium border transition-colors',
                  draftLayout.columnCount === n
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-muted',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draftLayout.columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
            <div className={cn('grid gap-3', draftLayout.columnCount === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
              {draftLayout.columns.map((col, colIndex) => (
                <SortableColumnCard
                  key={col.id}
                  col={col}
                  colIndex={colIndex}
                  availableTypes={getAvailableTypes(col.id)}
                  onUpdateHeader={label => updateColumnHeader(col.id, label)}
                  onUpdateWidth={pct => updateColumnWidth(col.id, pct)}
                  onUpdateSection={(sectionId, changes) => updateSection(col.id, sectionId, changes)}
                  onRemoveSection={sectionId => removeSection(col.id, sectionId)}
                  onAddSection={type => addSection(col.id, type)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {totalWidthPct(draftLayout.columns) !== 100 && (
          <p className="text-xs text-destructive">
            Column widths sum to {totalWidthPct(draftLayout.columns)}% — must equal 100%.
          </p>
        )}

        <Button onClick={saveLayout} disabled={savingLayout} className="h-9">
          {savingLayout ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save layout
        </Button>
      </div>

      {/* ── Status options ──────────────────────────────────────────────────── */}
      <div className="border-t border-border/40 pt-8 space-y-3 max-w-lg">
        <h3 className="text-sm font-semibold">Priority card statuses</h3>
        <p className="text-xs text-muted-foreground">
          These cycle on each priority card when you click the status badge.
          Defaults: WIP = Work in Progress, WOS = Waiting on Someone.
        </p>
        <div className="space-y-2">
          {draft.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={opt}
                onChange={e => update(idx, e.target.value)}
                placeholder={`Status ${idx + 1}`}
                className="h-9 text-sm max-w-xs"
              />
              <button onClick={() => remove(idx)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="h-8 text-xs mt-1" onClick={addOption}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add status
          </Button>
        </div>
        <Button onClick={saveStatuses} disabled={saving} variant="outline" className="h-9">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save statuses
        </Button>
      </div>
    </div>
  );
}
