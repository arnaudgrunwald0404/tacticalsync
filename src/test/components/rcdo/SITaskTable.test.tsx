import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@/test/test-utils';
import { DndContext } from '@dnd-kit/core';
import { SITaskTable } from '@/components/rcdo/SITaskTable';
import type { TaskWithRelations } from '@/types/rcdo';

// Toast must be stable — see useSubSIs.test.ts for the why. Not critical here
// (SITaskTable doesn't call it) but matches the pattern.
vi.mock('@/hooks/use-toast', () => {
  const toast = vi.fn();
  const ret = { toast };
  return { useToast: () => ret };
});

// updateTask is called by inline edits but not by the bulk paths we exercise.
vi.mock('@/hooks/useTasks', () => ({
  updateTask: vi.fn(),
}));

const makeTask = (overrides: Partial<TaskWithRelations> & { id: string; title: string }): TaskWithRelations =>
  ({
    id: overrides.id,
    title: overrides.title,
    completion_criteria: overrides.completion_criteria ?? null,
    owner_user_id: overrides.owner_user_id ?? 'user-1',
    strategic_initiative_id: overrides.strategic_initiative_id ?? 'si-1',
    start_date: overrides.start_date ?? null,
    target_delivery_date: overrides.target_delivery_date ?? null,
    actual_delivery_date: null,
    notes: null,
    status: overrides.status ?? 'not_assigned',
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    display_order: overrides.display_order ?? 0,
    owner: overrides.owner ?? null,
  } as unknown as TaskWithRelations);

const TASKS: TaskWithRelations[] = [
  makeTask({ id: 't-1', title: 'First task' }),
  makeTask({ id: 't-2', title: 'Second task' }),
  makeTask({ id: 't-3', title: 'Third task' }),
];

// Helpers
const renderInDnd = (ui: React.ReactElement) => render(<DndContext>{ui}</DndContext>);

// Toggle a row's checkbox. The aria-label flips between
// `Select "<title>"` and `Deselect "<title>"` based on current state,
// so we accept either form.
const toggleRow = (title: string) => {
  const cb = screen.queryByLabelText(`Select "${title}"`) ?? screen.getByLabelText(`Deselect "${title}"`);
  fireEvent.click(cb);
};
// Backwards-compat alias for tests that always start unselected.
const selectRow = toggleRow;

let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Default to OK — tests that want to verify cancel-path override this.
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  confirmSpy.mockRestore();
});

describe('SITaskTable — bulk-promote button', () => {
  it('does NOT render the checkbox column or bulk bar when no bulk handlers are wired', () => {
    renderInDnd(
      <SITaskTable tasks={TASKS} onEditTask={vi.fn()} onRefetch={vi.fn()} />,
    );
    // No "Select" checkboxes should be present (the column only renders when
    // any bulk capability is enabled).
    expect(screen.queryByLabelText(/^Select "/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Promote to sub-initiatives/i })).toBeNull();
  });

  it('renders the "Promote to sub-initiatives" button only when rows are selected', () => {
    const onPromoteTasks = vi.fn();
    renderInDnd(
      <SITaskTable
        tasks={TASKS}
        onEditTask={vi.fn()}
        onRefetch={vi.fn()}
        onPromoteTasks={onPromoteTasks}
      />,
    );

    // Checkboxes are present (because bulk capability is on), but the action
    // bar is hidden until at least one row is selected.
    expect(screen.queryByRole('button', { name: /Promote to sub-initiatives/i })).toBeNull();

    selectRow('First task');
    expect(screen.getByRole('button', { name: /Promote to sub-initiatives/i })).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('calls onPromoteTasks with the selected ids after confirm', () => {
    const onPromoteTasks = vi.fn();
    renderInDnd(
      <SITaskTable
        tasks={TASKS}
        onEditTask={vi.fn()}
        onRefetch={vi.fn()}
        onPromoteTasks={onPromoteTasks}
      />,
    );

    selectRow('First task');
    selectRow('Third task');
    fireEvent.click(screen.getByRole('button', { name: /Promote to sub-initiatives/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // Confirmation copy should mention the count so users know what they're doing.
    expect(confirmSpy.mock.calls[0][0]).toMatch(/2 tasks/);
    expect(onPromoteTasks).toHaveBeenCalledTimes(1);
    const ids = onPromoteTasks.mock.calls[0][0] as string[];
    expect(ids.sort()).toEqual(['t-1', 't-3']);
  });

  it('does NOT call onPromoteTasks when the user cancels the confirm', () => {
    confirmSpy.mockReturnValue(false);
    const onPromoteTasks = vi.fn();
    renderInDnd(
      <SITaskTable
        tasks={TASKS}
        onEditTask={vi.fn()}
        onRefetch={vi.fn()}
        onPromoteTasks={onPromoteTasks}
      />,
    );

    selectRow('First task');
    fireEvent.click(screen.getByRole('button', { name: /Promote to sub-initiatives/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onPromoteTasks).not.toHaveBeenCalled();
    // Selection should NOT clear on cancel — user can correct their action.
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('uses singular "task" wording in the confirm when exactly one is selected', () => {
    const onPromoteTasks = vi.fn();
    renderInDnd(
      <SITaskTable
        tasks={TASKS}
        onEditTask={vi.fn()}
        onRefetch={vi.fn()}
        onPromoteTasks={onPromoteTasks}
      />,
    );
    selectRow('Second task');
    fireEvent.click(screen.getByRole('button', { name: /Promote to sub-initiatives/i }));
    expect(confirmSpy.mock.calls[0][0]).toMatch(/Promote task/);
  });
});

describe('SITaskTable — checkbox + selection state', () => {
  it('toggles the bulk bar visibility as rows are selected/deselected', () => {
    renderInDnd(
      <SITaskTable
        tasks={TASKS}
        onEditTask={vi.fn()}
        onRefetch={vi.fn()}
        onPromoteTasks={vi.fn()}
      />,
    );

    selectRow('First task');
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    selectRow('Second task');
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    // Clicking again deselects (label is now "Deselect …" — toggleRow handles both).
    toggleRow('First task');
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('shows the header "Select all tasks" / "Deselect all tasks" checkbox', () => {
    renderInDnd(
      <SITaskTable
        tasks={TASKS}
        onEditTask={vi.fn()}
        onRefetch={vi.fn()}
        onPromoteTasks={vi.fn()}
      />,
    );

    const headerCb = screen.getByLabelText('Select all tasks');
    fireEvent.click(headerCb);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    // Label flips once everything is selected.
    expect(screen.getByLabelText('Deselect all tasks')).toBeInTheDocument();
  });

  it('prunes stale selections when the underlying tasks array shrinks', () => {
    const { rerender } = renderInDnd(
      <SITaskTable
        tasks={TASKS}
        onEditTask={vi.fn()}
        onRefetch={vi.fn()}
        onPromoteTasks={vi.fn()}
      />,
    );

    selectRow('First task');
    selectRow('Second task');
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    // Simulate a refetch that returns fewer rows (e.g., one was deleted).
    rerender(
      <DndContext>
        <SITaskTable
          tasks={[TASKS[0]]}
          onEditTask={vi.fn()}
          onRefetch={vi.fn()}
          onPromoteTasks={vi.fn()}
        />
      </DndContext>,
    );

    // 't-2' is no longer in the live list → selection drops to 1.
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });
});

describe('SITaskTable — sortable mode rendering', () => {
  it('renders drag handles per row when `draggableContainerId` is set', () => {
    renderInDnd(
      <SITaskTable
        tasks={TASKS}
        onEditTask={vi.fn()}
        onRefetch={vi.fn()}
        draggableContainerId="si-1"
        onReorderTasks={vi.fn()}
      />,
    );
    // One drag handle per task row.
    const handles = screen.getAllByLabelText('Drag to move task');
    expect(handles).toHaveLength(TASKS.length);
  });

  it('does NOT render drag handles when no container id is set', () => {
    renderInDnd(
      <SITaskTable tasks={TASKS} onEditTask={vi.fn()} onRefetch={vi.fn()} />,
    );
    expect(screen.queryAllByLabelText('Drag to move task')).toHaveLength(0);
  });
});

describe('SITaskTable — empty / loading states', () => {
  it('shows the empty message when there are no tasks', () => {
    renderInDnd(
      <SITaskTable
        tasks={[]}
        onEditTask={vi.fn()}
        onRefetch={vi.fn()}
        emptyMessage="Nothing here yet."
      />,
    );
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('shows skeleton placeholders while loading', () => {
    const { container } = renderInDnd(
      <SITaskTable tasks={[]} loading onEditTask={vi.fn()} onRefetch={vi.fn()} />,
    );
    // Skeletons use the shadcn Skeleton component; look for its animate-pulse class.
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
