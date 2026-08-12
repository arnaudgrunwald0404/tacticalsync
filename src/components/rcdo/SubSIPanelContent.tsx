import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, ExternalLink, Pencil, MoreVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OwnerCombobox } from '@/components/ui/owner-combobox';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRCDOPermissions } from '@/hooks/useRCDOPermissions';
import { useTasksBySI } from '@/hooks/useTasks';
import { SIStatusControl } from '@/components/rcdo/SIStatusControl';
import { updateInitiative, deleteInitiative } from '@/hooks/useRCDOMutations';
import type { Tables } from '@/integrations/supabase/types';
import type { InitiativeStatus } from '@/types/rcdo';

type SubSIRow = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  owner_user_id: string | null;
  parent_si_id: string | null;
  locked_at: string | null;
};

interface SubSIPanelContentProps {
  subSiId: string;
  // Right-edge offset in px supplied by the parent so positioning composes
  // with whatever other panels are open (DO + SI). The panel pins to that
  // offset from the right edge of the viewport.
  rightOffsetPx: number;
  // Parent SI title — shown as a small breadcrumb so the user remembers
  // which initiative this sub-initiative belongs to without a back button.
  parentSiTitle?: string;
  profiles: Tables<'profiles'>[];
  onClose: () => void;
  // Bubble up after any persisted change so the parent SI panel can refresh
  // its sub-SI list (status badges, names, etc. stay in sync).
  onChanged?: () => void;
}

export function SubSIPanelContent({
  subSiId,
  rightOffsetPx,
  parentSiTitle,
  profiles,
  onClose,
  onChanged,
}: SubSIPanelContentProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cycleParam = searchParams.get('cycle');
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { canEditInitiative } = useRCDOPermissions();
  const { tasks: subSiTasks } = useTasksBySI(subSiId);

  const [row, setRow] = useState<SubSIRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('rc_strategic_initiatives')
      .select('id, title, description, status, start_date, end_date, owner_user_id, parent_si_id, locked_at')
      .eq('id', subSiId)
      .single()
      .then(({ data }) => {
        if (!cancelled) {
          setRow((data as SubSIRow) || null);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [subSiId]);

  const canEditSubSIStatus = row ? canEditInitiative(row.owner_user_id || '', row.locked_at) : false;

  const updateField = async (patch: Partial<Omit<SubSIRow, 'id' | 'parent_si_id' | 'status'>> & { status?: InitiativeStatus }) => {
    if (!row) return;
    // Optimistic so the field doesn't visually snap back while the request
    // is in flight. The toast handles the failure path and the parent
    // refresh keeps the list view in sync.
    setRow({ ...row, ...patch });
    try {
      await updateInitiative(row.id, patch);
    } catch (e) {
      toast({ title: 'Update failed', description: e instanceof Error ? e.message : 'Something went wrong.', variant: 'destructive' });
      return;
    }
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!row) return;
    if (!window.confirm(`Delete "${row.title || 'this sub-initiative'}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteInitiative(row.id);
      onChanged?.();
      onClose();
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Could not delete this sub-initiative.', variant: 'destructive' });
    }
  };

  const content = (
    <>
      {/* Pill + breadcrumb + icons row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-body text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap bg-[#4A5D5F] text-white">
            Sub-initiative
          </span>
          {parentSiTitle && (
            <span className="text-xs text-muted-foreground truncate" title={parentSiTitle}>
              of {parentSiTitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {row && (
            <button
              className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent"
              aria-label="Open in full page"
              title="Open in full page"
              onClick={() => {
                navigate(`/rcdo/detail/si/${row.id}${cycleParam ? `?cycle=${cycleParam}` : ''}`);
                if (isMobile) onClose();
              }}
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
          {row && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent" aria-label="More actions">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-red-600" onClick={handleDelete}>Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Inline-editable title */}
      <div className="flex items-center gap-2 mb-3 group/title">
        {editingTitle && row ? (
          <input
            autoFocus
            className="text-base font-semibold bg-transparent border-b-2 border-blue-500 focus:outline-none flex-1 min-w-0"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleDraft.trim() && titleDraft !== row.title) void updateField({ title: titleDraft.trim() });
              else setTitleDraft(row.title);
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (titleDraft.trim() && titleDraft !== row.title) void updateField({ title: titleDraft.trim() });
                setEditingTitle(false);
              }
              if (e.key === 'Escape') { if (row) setTitleDraft(row.title); setEditingTitle(false); }
            }}
          />
        ) : (
          <>
            <h3 className="text-base font-semibold">
              {row?.title || (loading ? 'Loading…' : 'Untitled sub-initiative')}
            </h3>
            {row && (
              <button
                type="button"
                onClick={() => { setTitleDraft(row.title); setEditingTitle(true); }}
                className="opacity-0 group-hover/title:opacity-100 p-1 rounded hover:bg-accent text-muted-foreground transition-opacity shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      {row && (
        <div className="space-y-3">
          {/* Status */}
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium shrink-0">Status</Label>
            <SIStatusControl
              variant="select"
              status={row.status}
              canEdit={canEditSubSIStatus}
              taskCount={subSiTasks.length}
              onStatusChange={(v) => updateField({ status: v })}
            />
          </div>

          {/* Owner — moved above Description */}
          <div>
            <label className="text-sm font-medium">Owner</label>
            <div className="mt-1">
              <OwnerCombobox
                profiles={profiles}
                selectedId={row.owner_user_id || undefined}
                placeholder="Select owner"
                onSelectionChange={(val) => void updateField({ owner_user_id: val || null })}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              className="mt-1 w-full rounded border px-2 py-2 text-sm bg-background resize-none placeholder:text-muted-foreground"
              rows={4}
              placeholder="What does this sub-initiative cover?"
              value={row.description || ''}
              onChange={(e) => setRow({ ...row, description: e.target.value })}
              onBlur={() => void updateField({ description: row.description?.trim() ? row.description : null })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sub-si-start" className="text-sm font-medium">Start Date</Label>
              <Input
                id="sub-si-start"
                type="date"
                className="h-9 text-sm"
                value={row.start_date || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value && row.end_date && row.end_date < value) {
                    toast({ title: 'Invalid date', description: 'Start date must be on or before the target delivery date.', variant: 'destructive' });
                    return;
                  }
                  void updateField({ start_date: value || null });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sub-si-end" className="text-sm font-medium">Target Delivery Date</Label>
              <Input
                id="sub-si-end"
                type="date"
                className="h-9 text-sm"
                value={row.end_date || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value && row.start_date && value < row.start_date) {
                    toast({ title: 'Invalid date', description: 'Target delivery date must be on or after the start date.', variant: 'destructive' });
                    return;
                  }
                  void updateField({ end_date: value || null });
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="h-[90vh] max-h-[90vh] overflow-y-auto">
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="fixed top-0 h-full w-[420px] bg-[#EEEAE3] border-l shadow-2xl p-4 flex flex-col overflow-y-auto z-[65]"
      style={{ right: `${rightOffsetPx}px` }}
    >
      {content}
    </div>
  );
}
