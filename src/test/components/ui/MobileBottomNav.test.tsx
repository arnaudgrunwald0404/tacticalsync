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
      expect(screen.getByLabelText('CoS')).toBeInTheDocument();
      expect(screen.getByLabelText('Dashboard')).toBeInTheDocument();
      expect(screen.getByLabelText('RCDO')).toBeInTheDocument();
      expect(screen.getByLabelText("P&C's")).toBeInTheDocument();
      expect(screen.getByLabelText('Meetings')).toBeInTheDocument();
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
    it('should mark RCDO as active on /dashboard/rcdo', () => {
      renderWithPath('/dashboard/rcdo');
      const strategyBtn = screen.getByLabelText('RCDO');
      expect(strategyBtn).toHaveClass('text-primary');
    });

    it('should mark Meetings as active on /my-meetings', () => {
      renderWithPath('/my-meetings');
      const meetingsBtn = screen.getByLabelText('Meetings');
      expect(meetingsBtn).toHaveClass('text-primary');
    });

    it('should mark Dashboard as active on /workspace', () => {
      renderWithPath('/workspace');
      const workspaceBtn = screen.getByLabelText('Dashboard');
      expect(workspaceBtn).toHaveClass('text-primary');
    });

    it("should mark P&C's as active on /commitments", () => {
      renderWithPath('/commitments');
      const commitmentsBtn = screen.getByLabelText("P&C's");
      expect(commitmentsBtn).toHaveClass('text-primary');
    });

    it("should default to P&C's active on unknown paths", () => {
      renderWithPath('/some-unknown-path');
      const commitmentsBtn = screen.getByLabelText("P&C's");
      expect(commitmentsBtn).toHaveClass('text-primary');
    });

    it('should mark CoS as active on /chief-of-staff', () => {
      renderWithPath('/chief-of-staff');
      const cosBtn = screen.getByLabelText('CoS');
      expect(cosBtn).toHaveClass('text-primary');
    });
  });

  describe('navigation', () => {
    it('should navigate to /dashboard/rcdo when RCDO is clicked', async () => {
      const user = userEvent.setup();
      renderWithPath('/commitments');
      await user.click(screen.getByLabelText('RCDO'));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/rcdo');
    });

    it('should navigate to /my-meetings when Meetings is clicked', async () => {
      const user = userEvent.setup();
      renderWithPath('/commitments');
      await user.click(screen.getByLabelText('Meetings'));
      expect(mockNavigate).toHaveBeenCalledWith('/my-meetings');
    });

    it('should navigate to /workspace when Dashboard is clicked', async () => {
      const user = userEvent.setup();
      renderWithPath('/commitments');
      await user.click(screen.getByLabelText('Dashboard'));
      expect(mockNavigate).toHaveBeenCalledWith('/workspace');
    });

    it("should navigate to /commitments when P&C's is clicked", async () => {
      const user = userEvent.setup();
      renderWithPath('/my-meetings');
      await user.click(screen.getByLabelText("P&C's"));
      expect(mockNavigate).toHaveBeenCalledWith('/commitments');
    });

    it('should navigate to /chief-of-staff when CoS is clicked', async () => {
      const user = userEvent.setup();
      renderWithPath('/commitments');
      await user.click(screen.getByLabelText('CoS'));
      expect(mockNavigate).toHaveBeenCalledWith('/chief-of-staff');
    });
  });
});
