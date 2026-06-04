import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, ExternalLink } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OwnerCombobox } from '@/components/ui/owner-combobox';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
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

const STATUS_OPTIONS: { value: InitiativeStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'initialized', label: 'Initialized' },
  { value: 'on_track', label: 'On Track' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Same normalization the SIPanel uses — keeps legacy values from breaking the
// Select trigger when older rows still carry them.
function normalizeStatus(status: string | null | undefined): InitiativeStatus {
  if (!status) return 'draft';
  const valid: InitiativeStatus[] = ['draft', 'initialized', 'on_track', 'delayed', 'cancelled'];
  if (valid.includes(status as InitiativeStatus)) return status as InitiativeStatus;
  const map: Record<string, InitiativeStatus> = {
    not_started: 'draft',
    at_risk: 'delayed',
    off_track: 'delayed',
    completed: 'on_track',
    active: 'on_track',
    blocked: 'delayed',
    done: 'on_track',
  };
  return map[status] || 'draft';
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

  const [row, setRow] = useState<SubSIRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('rc_strategic_initiatives')
      .select('id, title, description, status, start_date, end_date, owner_user_id, parent_si_id')
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

  const updateField = async (patch: Partial<SubSIRow>) => {
    if (!row) return;
    // Optimistic so the field doesn't visually snap back while the request
    // is in flight. The toast handles the failure path and the parent
    // refresh keeps the list view in sync.
    setRow({ ...row, ...patch });
    const { error } = await supabase
      .from('rc_strategic_initiatives')
      .update(patch)
      .eq('id', row.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    onChanged?.();
  };

  const content = (
    <>
      <div className="mb-3 flex items-center gap-2">
        <span className="font-body text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap bg-[#4A5D5F] text-white">
          Sub-initiative
        </span>
        {parentSiTitle && (
          <span className="text-xs text-muted-foreground truncate" title={parentSiTitle}>
            of {parentSiTitle}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold truncate">
          {row?.title || (loading ? 'Loading…' : 'Untitled sub-initiative')}
        </h3>
        <div className="flex items-center gap-1">
          {row && (
            <button
              className="h-10 w-10 inline-flex items-center justify-center rounded hover:bg-accent min-h-[44px] min-w-[44px]"
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
          <button
            className="h-10 w-10 inline-flex items-center justify-center rounded hover:bg-accent min-h-[44px] min-w-[44px]"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {row && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Status</Label>
            <Select
              value={normalizeStatus(row.status)}
              onValueChange={(v: InitiativeStatus) => updateField({ status: v })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Name</label>
            <input
              className="w-full rounded border px-2 py-1 text-sm bg-background"
              value={row.title}
              onChange={(e) => setRow({ ...row, title: e.target.value })}
              onBlur={() => {
                if (row.title.trim().length === 0) return;
                void updateField({ title: row.title.trim() });
              }}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              className="mt-1 w-full rounded border px-2 py-2 text-sm bg-background resize-none"
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
                  if (value && row.end_date && row.end_date < value) return;
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
                  if (value && row.start_date && value < row.start_date) return;
                  void updateField({ end_date: value || null });
                }}
              />
            </div>
          </div>

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
