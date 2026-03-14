import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { CommitmentQuarter, CreateQuarterForm } from '@/types/commitments';

interface QuarterSelectorProps {
  quarters: CommitmentQuarter[];
  selected: CommitmentQuarter | null;
  onSelect: (q: CommitmentQuarter) => void;
  onCreateQuarter?: (form: CreateQuarterForm) => Promise<CommitmentQuarter | null>;
  isAdmin?: boolean;
}

const statusLabel: Record<CommitmentQuarter['status'], string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

export function QuarterSelector({
  quarters,
  selected,
  onSelect,
  onCreateQuarter,
  isAdmin = false,
}: QuarterSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateQuarterForm>({ label: '', start_date: '', end_date: '' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!onCreateQuarter || !form.label || !form.start_date || !form.end_date) return;
    setSaving(true);
    const created = await onCreateQuarter(form);
    setSaving(false);
    if (created) { onSelect(created); setShowCreate(false); setForm({ label: '', start_date: '', end_date: '' }); }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            {selected?.label ?? 'Select quarter'}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {quarters.map(q => (
            <DropdownMenuItem
              key={q.id}
              onClick={() => onSelect(q)}
              className="flex items-center justify-between gap-2"
            >
              <span>{q.label}</span>
              {q.status !== 'active' && (
                <Badge variant="outline" className="text-[10px]">
                  {statusLabel[q.status]}
                </Badge>
              )}
            </DropdownMenuItem>
          ))}
          {isAdmin && onCreateQuarter && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                New quarter
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Quarter</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                placeholder="Q2 2026"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start">Start date</Label>
                <Input
                  id="start"
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end">End date</Label>
                <Input
                  id="end"
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.label || !form.start_date || !form.end_date}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
