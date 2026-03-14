import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { CommitmentCell } from '@/components/commitments/CommitmentCell';
import type { MonthlyCommitment } from '@/types/commitments';

const makeCommitment = (overrides: Partial<MonthlyCommitment> = {}): MonthlyCommitment => ({
  id: 'c-1',
  quarter_id: 'q-1',
  user_id: 'u-1',
  month_number: 1,
  title: 'Ship the feature',
  description: null,
  status: 'pending',
  display_order: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const defaultProps = {
  quarterId: 'q-1',
  userId: 'u-1',
  monthNumber: 1,
  displayOrder: 1,
  onSave: vi.fn().mockResolvedValue(undefined),
  onDelete: vi.fn().mockResolvedValue(undefined),
  onStatusChange: vi.fn().mockResolvedValue(undefined),
};

describe('CommitmentCell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty state (no commitment)', () => {
    it('should render add-commitment placeholder when no commitment and not readOnly', () => {
      render(<CommitmentCell {...defaultProps} />);
      expect(screen.getByText('Add commitment')).toBeInTheDocument();
    });

    it('should render nothing when no commitment and readOnly', () => {
      const { container } = render(<CommitmentCell {...defaultProps} readOnly />);
      expect(container.firstChild).toBeNull();
    });

    it('should enter editing mode when placeholder is clicked', async () => {
      const user = userEvent.setup();
      render(<CommitmentCell {...defaultProps} />);
      await user.click(screen.getByText('Add commitment'));
      expect(screen.getByPlaceholderText('Describe this commitment…')).toBeInTheDocument();
    });
  });

  describe('with existing commitment', () => {
    it('should display the commitment title', () => {
      render(<CommitmentCell {...defaultProps} commitment={makeCommitment()} />);
      expect(screen.getByText('Ship the feature')).toBeInTheDocument();
    });

    it('should display the StatusBadge for the commitment', () => {
      render(<CommitmentCell {...defaultProps} commitment={makeCommitment({ status: 'done' })} />);
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    it('should enter editing mode when title text is clicked (non-readOnly)', async () => {
      const user = userEvent.setup();
      render(<CommitmentCell {...defaultProps} commitment={makeCommitment()} />);
      await user.click(screen.getByText('Ship the feature'));
      expect(screen.getByPlaceholderText('Describe this commitment…')).toBeInTheDocument();
    });

    it('should not enter editing mode when readOnly', async () => {
      const user = userEvent.setup();
      render(<CommitmentCell {...defaultProps} commitment={makeCommitment()} readOnly />);
      await user.click(screen.getByText('Ship the feature'));
      expect(screen.queryByPlaceholderText('Describe this commitment…')).not.toBeInTheDocument();
    });

    it('should call onStatusChange with next status when StatusBadge is clicked', async () => {
      const user = userEvent.setup();
      render(<CommitmentCell {...defaultProps} commitment={makeCommitment({ status: 'pending' })} />);
      // StatusBadge button has title = label
      await user.click(screen.getByTitle('Pending'));
      expect(defaultProps.onStatusChange).toHaveBeenCalledWith('in_progress');
    });

    it('should not call onStatusChange in readOnly mode', async () => {
      const user = userEvent.setup();
      render(<CommitmentCell {...defaultProps} commitment={makeCommitment({ status: 'pending' })} readOnly />);
      // In readOnly, onClick is undefined so it doesn't cycle
      // The badge button is still rendered but has no onClick
      const badge = screen.getByTitle('Pending');
      await user.click(badge);
      expect(defaultProps.onStatusChange).not.toHaveBeenCalled();
    });
  });

  describe('editing mode', () => {
    it('should call onSave with trimmed value on blur when value changed', async () => {
      const user = userEvent.setup();
      render(<CommitmentCell {...defaultProps} commitment={makeCommitment()} />);
      await user.click(screen.getByText('Ship the feature'));
      const textarea = screen.getByPlaceholderText('Describe this commitment…');
      await user.clear(textarea);
      await user.type(textarea, 'New commitment text');
      fireEvent.blur(textarea);
      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith('New commitment text');
      });
    });

    it('should not call onSave when value is unchanged on blur', async () => {
      const user = userEvent.setup();
      render(<CommitmentCell {...defaultProps} commitment={makeCommitment()} />);
      await user.click(screen.getByText('Ship the feature'));
      const textarea = screen.getByPlaceholderText('Describe this commitment…');
      fireEvent.blur(textarea);
      await waitFor(() => {
        expect(defaultProps.onSave).not.toHaveBeenCalled();
      });
    });

    it('should cancel editing on Escape key', async () => {
      const user = userEvent.setup();
      render(<CommitmentCell {...defaultProps} commitment={makeCommitment()} />);
      await user.click(screen.getByText('Ship the feature'));
      const textarea = screen.getByPlaceholderText('Describe this commitment…');
      await user.clear(textarea);
      await user.type(textarea, 'Changed');
      fireEvent.keyDown(textarea, { key: 'Escape' });
      expect(screen.getByText('Ship the feature')).toBeInTheDocument();
    });

    it('should submit on Enter key (no shift)', async () => {
      const user = userEvent.setup();
      render(<CommitmentCell {...defaultProps} commitment={makeCommitment()} />);
      await user.click(screen.getByText('Ship the feature'));
      const textarea = screen.getByPlaceholderText('Describe this commitment…');
      await user.clear(textarea);
      await user.type(textarea, 'New value');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      // After Enter, blur fires which triggers onSave
      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalled();
      });
    });
  });
});
