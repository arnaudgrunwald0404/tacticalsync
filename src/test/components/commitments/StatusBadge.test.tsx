import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { StatusBadge, nextStatus } from '@/components/commitments/StatusBadge';
import type { CommitmentStatus } from '@/types/commitments';

describe('StatusBadge', () => {
  describe('rendering labels', () => {
    it('should render "Draft" for draft status', () => {
      render(<StatusBadge status="draft" />);
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('should render "In Progress" for in_progress status', () => {
      render(<StatusBadge status="in_progress" />);
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('should render "Done" for done status', () => {
      render(<StatusBadge status="done" />);
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    it('should render "Not Done" for not_done status', () => {
      render(<StatusBadge status="not_done" />);
      expect(screen.getByText('Not Done')).toBeInTheDocument();
    });
  });

  describe('dot colors', () => {
    it('should apply gray dot for draft', () => {
      const { container } = render(<StatusBadge status="draft" />);
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

    it('should apply red dot for not_done', () => {
      const { container } = render(<StatusBadge status="not_done" />);
      const dot = container.querySelector('.bg-red-500');
      expect(dot).toBeInTheDocument();
    });
  });

  describe('click interaction', () => {
    it('should call onClick when provided and button is clicked', () => {
      const handleClick = vi.fn();
      render(<StatusBadge status="draft" onClick={handleClick} />);
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should render as cursor-pointer when onClick is provided', () => {
      render(<StatusBadge status="draft" onClick={vi.fn()} />);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('cursor-pointer');
    });

    it('should render as cursor-default when onClick is not provided', () => {
      render(<StatusBadge status="draft" />);
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
      render(<StatusBadge status="draft" className="mt-2" />);
      expect(screen.getByRole('button')).toHaveClass('mt-2');
    });
  });
});

describe('nextStatus', () => {
  it('should cycle draft -> in_progress', () => {
    expect(nextStatus('draft')).toBe('in_progress');
  });

  it('should cycle in_progress -> done', () => {
    expect(nextStatus('in_progress')).toBe('done');
  });

  it('should cycle done -> not_done', () => {
    expect(nextStatus('done')).toBe('not_done');
  });

  it('should cycle not_done -> draft (wraps around)', () => {
    expect(nextStatus('not_done')).toBe('draft');
  });

  it('should complete a full cycle back to start', () => {
    let status: CommitmentStatus = 'draft';
    status = nextStatus(status);
    status = nextStatus(status);
    status = nextStatus(status);
    status = nextStatus(status);
    expect(status).toBe('draft');
  });
});
