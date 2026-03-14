import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { StatusBadge, nextStatus } from '@/components/commitments/StatusBadge';
import type { CommitmentStatus } from '@/types/commitments';

describe('StatusBadge', () => {
  describe('rendering labels', () => {
    it('should render "Pending" for pending status', () => {
      render(<StatusBadge status="pending" />);
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('should render "In Progress" for in_progress status', () => {
      render(<StatusBadge status="in_progress" />);
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('should render "Done" for done status', () => {
      render(<StatusBadge status="done" />);
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    it('should render "At Risk" for at_risk status', () => {
      render(<StatusBadge status="at_risk" />);
      expect(screen.getByText('At Risk')).toBeInTheDocument();
    });
  });

  describe('dot colors', () => {
    it('should apply gray dot for pending', () => {
      const { container } = render(<StatusBadge status="pending" />);
      const dot = container.querySelector('.bg-gray-300');
      expect(dot).toBeInTheDocument();
    });

    it('should apply yellow dot for in_progress', () => {
      const { container } = render(<StatusBadge status="in_progress" />);
      const dot = container.querySelector('.bg-yellow-400');
      expect(dot).toBeInTheDocument();
    });

    it('should apply green dot for done', () => {
      const { container } = render(<StatusBadge status="done" />);
      const dot = container.querySelector('.bg-green-500');
      expect(dot).toBeInTheDocument();
    });

    it('should apply red dot for at_risk', () => {
      const { container } = render(<StatusBadge status="at_risk" />);
      const dot = container.querySelector('.bg-red-500');
      expect(dot).toBeInTheDocument();
    });
  });

  describe('click interaction', () => {
    it('should call onClick when provided and button is clicked', () => {
      const handleClick = vi.fn();
      render(<StatusBadge status="pending" onClick={handleClick} />);
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should render as cursor-pointer when onClick is provided', () => {
      render(<StatusBadge status="pending" onClick={vi.fn()} />);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('cursor-pointer');
    });

    it('should render as cursor-default when onClick is not provided', () => {
      render(<StatusBadge status="pending" />);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('cursor-default');
    });

    it('should have a title attribute matching the label', () => {
      render(<StatusBadge status="done" />);
      expect(screen.getByRole('button')).toHaveAttribute('title', 'Done');
    });
  });

  describe('className prop', () => {
    it('should apply custom className', () => {
      render(<StatusBadge status="pending" className="mt-2" />);
      expect(screen.getByRole('button')).toHaveClass('mt-2');
    });
  });
});

describe('nextStatus', () => {
  it('should cycle pending -> in_progress', () => {
    expect(nextStatus('pending')).toBe('in_progress');
  });

  it('should cycle in_progress -> done', () => {
    expect(nextStatus('in_progress')).toBe('done');
  });

  it('should cycle done -> at_risk', () => {
    expect(nextStatus('done')).toBe('at_risk');
  });

  it('should cycle at_risk -> pending (wraps around)', () => {
    expect(nextStatus('at_risk')).toBe('pending');
  });

  it('should complete a full cycle back to start', () => {
    let status: CommitmentStatus = 'pending';
    status = nextStatus(status);
    status = nextStatus(status);
    status = nextStatus(status);
    status = nextStatus(status);
    expect(status).toBe('pending');
  });
});
