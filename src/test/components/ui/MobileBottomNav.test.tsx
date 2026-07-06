import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MobileBottomNav } from '@/components/ui/mobile-bottom-nav';

// Mock useNavigate to capture navigation calls
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderWithPath(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <MobileBottomNav />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MobileBottomNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render all five nav items', () => {
      renderWithPath('/commitments');
      expect(screen.getByLabelText('Inbox')).toBeInTheDocument();
      expect(screen.getByLabelText('Chief of Staff')).toBeInTheDocument();
      expect(screen.getByLabelText('Strategy')).toBeInTheDocument();
      expect(screen.getByLabelText('My tasks')).toBeInTheDocument();
      expect(screen.getByLabelText('Commitments')).toBeInTheDocument();
    });

    it('should render as a nav element', () => {
      renderWithPath('/commitments');
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('should render five buttons', () => {
      renderWithPath('/commitments');
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(5);
    });
  });

  describe('active tab detection', () => {
    it('should mark Strategy as active on /dashboard/rcdo', () => {
      renderWithPath('/dashboard/rcdo');
      const strategyBtn = screen.getByLabelText('Strategy');
      expect(strategyBtn).toHaveClass('text-primary');
    });

    it('should mark My tasks as active on /dashboard/rcdo/tasks-feed', () => {
      renderWithPath('/dashboard/rcdo/tasks-feed');
      const tasksBtn = screen.getByLabelText('My tasks');
      expect(tasksBtn).toHaveClass('text-primary');
    });

    it('should mark Commitments as active on /commitments', () => {
      renderWithPath('/commitments');
      const commitmentsBtn = screen.getByLabelText('Commitments');
      expect(commitmentsBtn).toHaveClass('text-primary');
    });

    it('should default to commitments active on unknown paths', () => {
      renderWithPath('/some-unknown-path');
      const commitmentsBtn = screen.getByLabelText('Commitments');
      expect(commitmentsBtn).toHaveClass('text-primary');
    });

    it('should mark CoS as active on /chief-of-staff', () => {
      renderWithPath('/chief-of-staff');
      const cosBtn = screen.getByLabelText('Chief of Staff');
      expect(cosBtn).toHaveClass('text-primary');
    });

    it('should mark Inbox as active on /inbox', () => {
      renderWithPath('/inbox');
      const inboxBtn = screen.getByLabelText('Inbox');
      expect(inboxBtn).toHaveClass('text-primary');
    });
  });

  describe('navigation', () => {
    it('should navigate to /dashboard/rcdo when Strategy is clicked', async () => {
      const user = userEvent.setup();
      renderWithPath('/commitments');
      await user.click(screen.getByLabelText('Strategy'));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/rcdo');
    });

    it('should navigate to /commitments when Commitments is clicked', async () => {
      const user = userEvent.setup();
      renderWithPath('/dashboard/rcdo');
      await user.click(screen.getByLabelText('Commitments'));
      expect(mockNavigate).toHaveBeenCalledWith('/commitments');
    });

    it('should navigate to tasks-feed when My tasks is clicked', async () => {
      const user = userEvent.setup();
      renderWithPath('/commitments');
      await user.click(screen.getByLabelText('My tasks'));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/rcdo/tasks-feed');
    });

    it('should navigate to /chief-of-staff when CoS is clicked', async () => {
      const user = userEvent.setup();
      renderWithPath('/commitments');
      await user.click(screen.getByLabelText('Chief of Staff'));
      expect(mockNavigate).toHaveBeenCalledWith('/chief-of-staff');
    });

    it('should navigate to /inbox when Inbox is clicked', async () => {
      const user = userEvent.setup();
      renderWithPath('/commitments');
      await user.click(screen.getByLabelText('Inbox'));
      expect(mockNavigate).toHaveBeenCalledWith('/inbox');
    });
  });
});
