import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ShortcutRow {
  keys: string;
  label: string;
}

// Grouped to match how a user thinks ("navigate" vs "act on this item"), not
// how the code is organized — see PLAN_idea2_dormant20.md Section 5.2.
const NAVIGATE: ShortcutRow[] = [
  { keys: 'j', label: 'Next item' },
  { keys: 'k', label: 'Previous item' },
  { keys: 'Enter', label: 'Open item' },
];

const ACT: ShortcutRow[] = [
  { keys: 'd', label: 'Mark done' },
  { keys: 'e', label: 'Edit text' },
  { keys: 's', label: 'Snooze' },
  { keys: 'x', label: 'Select (for bulk actions)' },
];

function ShortcutList({ rows }: { rows: ShortcutRow[] }) {
  return (
    <div className="space-y-1.5">
      {rows.map(row => (
        <div key={row.keys} className="flex items-center gap-3 text-sm">
          <kbd className="flex-shrink-0 min-w-[1.75rem] text-center px-1.5 py-0.5 rounded border border-gray-300 bg-gray-50 text-gray-700 text-xs font-mono">
            {row.keys}
          </kbd>
          <span className="text-gray-600">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

interface ShortcutsHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsHelpDialog({ open, onOpenChange }: ShortcutsHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-6 pt-1">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-2">Navigate</p>
            <ShortcutList rows={NAVIGATE} />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
              Act on the focused item
            </p>
            <ShortcutList rows={ACT} />
          </div>
        </div>
        <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
          Shortcuts don't work while typing in a text field.
        </p>
      </DialogContent>
    </Dialog>
  );
}
