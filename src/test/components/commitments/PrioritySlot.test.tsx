import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { PrioritySlot } from '@/components/commitments/PrioritySlot';
import type { PersonalPriority } from '@/types/commitments';

const makePriority = (overrides: Partial<PersonalPriority> = {}): PersonalPriority => ({
  id: 'p-1',
  quarter_id: 'q-1',
  user_id: 'u-1',
  title: 'Improve onboarding',
  description: null,
  display_order: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const defaultProps = {
  order: 1,
  onSave: vi.fn().mockResolvedValue(undefined),
  onDelete: vi.fn().mockResolvedValue(undefined),
};

describe('PrioritySlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty state (no priority)', () => {
    it('should render add-priority button when no priority and not readOnly', () => {
      render(<PrioritySlot {...defaultProps} />);
      expect(screen.getByText('Add priority')).toBeInTheDocument();
    });

    it('should show the order number in the empty state button', () => {
      render(<PrioritySlot {...defaultProps} order={2} />);
      const numberBadge = screen.getByText('2');
      expect(numberBadge).toBeInTheDocument();
    });

    it('should render a dash placeholder in readOnly empty state', () => {
      render(<PrioritySlot {...defaultProps} readOnly />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('should not show add button in readOnly empty state', () => {
      render(<PrioritySlot {...defaultProps} readOnly />);
      expect(screen.queryByText('Add priority')).not.toBeInTheDocument();
    });

    it('should enter editing mode on click', async () => {
      const user = userEvent.setup();
      render(<PrioritySlot {...defaultProps} />);
      await user.click(screen.getByText('Add priority'));
      expect(screen.getByPlaceholderText('Describe this quarterly priority…')).toBeInTheDocument();
    });
  });

  describe('with existing priority', () => {
    it('should display the priority title', () => {
      render(<PrioritySlot {...defaultProps} priority={makePriority()} />);
      expect(screen.getByText('Improve onboarding')).toBeInTheDocument();
    });

    it('should display the order number', () => {
      render(<PrioritySlot {...defaultProps} priority={makePriority()} order={3} />);
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should enter editing mode when title is clicked (non-readOnly)', async () => {
      const user = userEvent.setup();
      render(<PrioritySlot {...defaultProps} priority={makePriority()} />);
      await user.click(screen.getByText('Improve onboarding'));
      expect(screen.getByPlaceholderText('Describe this quarterly priority…')).toBeInTheDocument();
    });

    it('should not enter editing mode when readOnly', async () => {
      const user = userEvent.setup();
      render(<PrioritySlot {...defaultProps} priority={makePriority()} readOnly />);
      await user.click(screen.getByText('Improve onboarding'));
      expect(screen.queryByPlaceholderText('Describe this quarterly priority…')).not.toBeInTheDocument();
    });
  });

  describe('editing mode', () => {
    it('should call onSave with new value on blur when value changed', async () => {
      const user = userEvent.setup();
      render(<PrioritySlot {...defaultProps} priority={makePriority()} />);
      await user.click(screen.getByText('Improve onboarding'));
      const textarea = screen.getByPlaceholderText('Describe this quarterly priority…');
      await user.clear(textarea);
      await user.type(textarea, 'New priority title');
      fireEvent.blur(textarea);
      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith('New priority title');
      });
    });

    it('should not call onSave when value is unchanged on blur', async () => {
      const user = userEvent.setup();
      render(<PrioritySlot {...defaultProps} priority={makePriority()} />);
      await user.click(screen.getByText('Improve onboarding'));
      const textarea = screen.getByPlaceholderText('Describe this quarterly priority…');
      fireEvent.blur(textarea);
      await waitFor(() => {
        expect(defaultProps.onSave).not.toHaveBeenCalled();
      });
    });

    it('should cancel editing on Escape key and restore original value', async () => {
      const user = userEvent.setup();
      render(<PrioritySlot {...defaultProps} priority={makePriority()} />);
      await user.click(screen.getByText('Improve onboarding'));
      const textarea = screen.getByPlaceholderText('Describe this quarterly priority…');
      await user.clear(textarea);
      await user.type(textarea, 'Changed');
      fireEvent.keyDown(textarea, { key: 'Escape' });
      expect(screen.getByText('Improve onboarding')).toBeInTheDocument();
    });

    it('should submit on Enter key (non-shift)', async () => {
      const user = userEvent.setup();
      render(<PrioritySlot {...defaultProps} priority={makePriority()} />);
      await user.click(screen.getByText('Improve onboarding'));
      const textarea = screen.getByPlaceholderText('Describe this quarterly priority…');
      await user.clear(textarea);
      await user.type(textarea, 'Entered value');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalled();
      });
    });
  });
});
