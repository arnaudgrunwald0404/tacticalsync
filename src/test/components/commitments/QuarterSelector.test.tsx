import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { QuarterSelector } from '@/components/commitments/QuarterSelector';
import type { CommitmentQuarter, CreateQuarterForm } from '@/types/commitments';

const makeQuarter = (overrides: Partial<CommitmentQuarter> = {}): CommitmentQuarter => ({
  id: 'q-1',
  team_id: 't-1',
  label: 'Q1 2026',
  start_date: '2026-01-01',
  end_date: '2026-03-31',
  status: 'active',
  created_by: 'u-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('QuarterSelector', () => {
  const mockOnSelect = vi.fn();
  const mockOnCreateQuarter = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('trigger button', () => {
    it('should show selected quarter label on the trigger button', () => {
      const q = makeQuarter();
      render(
        <QuarterSelector quarters={[q]} selected={q} onSelect={mockOnSelect} />
      );
      expect(screen.getByRole('button', { name: /Q1 2026/i })).toBeInTheDocument();
    });

    it('should show "Select quarter" when no quarter is selected', () => {
      render(
        <QuarterSelector quarters={[]} selected={null} onSelect={mockOnSelect} />
      );
      expect(screen.getByRole('button', { name: /Select quarter/i })).toBeInTheDocument();
    });
  });

  describe('dropdown listing', () => {
    it('should list all quarters in the dropdown', async () => {
      const user = userEvent.setup();
      const quarters = [
        makeQuarter({ id: 'q-1', label: 'Q1 2026', status: 'active' }),
        makeQuarter({ id: 'q-2', label: 'Q4 2025', status: 'archived' }),
      ];
      render(<QuarterSelector quarters={quarters} selected={quarters[0]} onSelect={mockOnSelect} />);
      await user.click(screen.getByRole('button', { name: /Q1 2026/i }));
      expect(screen.getByText('Q4 2025')).toBeInTheDocument();
    });

    it('should show status badge for non-active quarters', async () => {
      const user = userEvent.setup();
      const quarters = [
        makeQuarter({ id: 'q-1', label: 'Q1 2026', status: 'active' }),
        makeQuarter({ id: 'q-2', label: 'Q4 2025', status: 'draft' }),
      ];
      render(<QuarterSelector quarters={quarters} selected={quarters[0]} onSelect={mockOnSelect} />);
      await user.click(screen.getByRole('button', { name: /Q1 2026/i }));
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('should not show status badge for active quarters', async () => {
      const user = userEvent.setup();
      const quarters = [makeQuarter({ status: 'active' })];
      render(<QuarterSelector quarters={quarters} selected={quarters[0]} onSelect={mockOnSelect} />);
      await user.click(screen.getByRole('button', { name: /Q1 2026/i }));
      expect(screen.queryByText('Active')).not.toBeInTheDocument();
    });

    it('should call onSelect when a quarter is clicked', async () => {
      const user = userEvent.setup();
      const quarters = [
        makeQuarter({ id: 'q-1', label: 'Q1 2026', status: 'active' }),
        makeQuarter({ id: 'q-2', label: 'Q4 2025', status: 'archived' }),
      ];
      render(<QuarterSelector quarters={quarters} selected={quarters[0]} onSelect={mockOnSelect} />);
      await user.click(screen.getByRole('button', { name: /Q1 2026/i }));
      await user.click(screen.getByText('Q4 2025'));
      expect(mockOnSelect).toHaveBeenCalledWith(quarters[1]);
    });
  });

  describe('admin "New quarter" option', () => {
    it('should show "New quarter" option for admin users', async () => {
      const user = userEvent.setup();
      render(
        <QuarterSelector
          quarters={[makeQuarter()]}
          selected={makeQuarter()}
          onSelect={mockOnSelect}
          onCreateQuarter={mockOnCreateQuarter}
          isAdmin
        />
      );
      await user.click(screen.getByRole('button', { name: /Q1 2026/i }));
      expect(screen.getByText('New quarter')).toBeInTheDocument();
    });

    it('should not show "New quarter" option for non-admin users', async () => {
      const user = userEvent.setup();
      render(
        <QuarterSelector
          quarters={[makeQuarter()]}
          selected={makeQuarter()}
          onSelect={mockOnSelect}
          onCreateQuarter={mockOnCreateQuarter}
          isAdmin={false}
        />
      );
      await user.click(screen.getByRole('button', { name: /Q1 2026/i }));
      expect(screen.queryByText('New quarter')).not.toBeInTheDocument();
    });

    it('should open create dialog when "New quarter" is clicked', async () => {
      const user = userEvent.setup();
      render(
        <QuarterSelector
          quarters={[makeQuarter()]}
          selected={makeQuarter()}
          onSelect={mockOnSelect}
          onCreateQuarter={mockOnCreateQuarter}
          isAdmin
        />
      );
      await user.click(screen.getByRole('button', { name: /Q1 2026/i }));
      await user.click(screen.getByText('New quarter'));
      expect(screen.getByText('New Quarter')).toBeInTheDocument();
    });
  });

  describe('create quarter dialog', () => {
    const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
      render(
        <QuarterSelector
          quarters={[makeQuarter()]}
          selected={makeQuarter()}
          onSelect={mockOnSelect}
          onCreateQuarter={mockOnCreateQuarter}
          isAdmin
        />
      );
      await user.click(screen.getByRole('button', { name: /Q1 2026/i }));
      await user.click(screen.getByText('New quarter'));
    };

    it('should disable Create button when form fields are empty', async () => {
      const user = userEvent.setup();
      await openDialog(user);
      expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    });

    it('should call onCreateQuarter with form data when submitted', async () => {
      const user = userEvent.setup();
      mockOnCreateQuarter.mockResolvedValue(makeQuarter({ id: 'q-new', label: 'Q2 2026' }));
      await openDialog(user);

      await user.type(screen.getByLabelText('Label'), 'Q2 2026');
      await user.type(screen.getByLabelText('Start date'), '2026-04-01');
      await user.type(screen.getByLabelText('End date'), '2026-06-30');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(mockOnCreateQuarter).toHaveBeenCalledWith({
          label: 'Q2 2026',
          start_date: '2026-04-01',
          end_date: '2026-06-30',
        });
      });
    });

    it('should close dialog when Cancel is clicked', async () => {
      const user = userEvent.setup();
      await openDialog(user);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => {
        expect(screen.queryByText('New Quarter')).not.toBeInTheDocument();
      });
    });
  });
});
