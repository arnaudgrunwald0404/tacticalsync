import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { InitiativeCard } from '@/components/rcdo/InitiativeCard';
import type { StrategicInitiativeWithRelations } from '@/types/rcdo';
import { supabase } from '@/integrations/supabase/client';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('InitiativeCard', () => {
  const mockUser = { id: 'user-1', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: mockUser },
      error: null,
    } as any);
  });

  const createMockInitiative = (
    status: StrategicInitiativeWithRelations['status'] = 'not_started'
  ): StrategicInitiativeWithRelations => ({
    id: 'si-1',
    defining_objective_id: 'do-1',
    title: 'Test Strategic Initiative',
    description: 'Test description',
    owner_user_id: 'user-1',
    participant_user_ids: null,
    start_date: null,
    end_date: null,
    status,
    locked_at: null,
    locked_by: null,
    display_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    owner: {
      id: 'user-1',
      first_name: 'Test',
      last_name: 'User',
      full_name: 'Test User',
    },
  });

  describe('Status Display', () => {
    it('should display "Not Started" status badge', () => {
      const initiative = createMockInitiative('not_started');
      render(<InitiativeCard initiative={initiative} />);
      
      expect(screen.getByText('Not Started')).toBeInTheDocument();
    });

    it('should display "On Track" status badge', () => {
      const initiative = createMockInitiative('on_track');
      render(<InitiativeCard initiative={initiative} />);
      
      expect(screen.getByText('On Track')).toBeInTheDocument();
    });

    it('should display "At Risk" status badge', () => {
      const initiative = createMockInitiative('at_risk');
      render(<InitiativeCard initiative={initiative} />);
      
      expect(screen.getByText('At Risk')).toBeInTheDocument();
    });

    it('should display "Off Track" status badge', () => {
      const initiative = createMockInitiative('off_track');
      render(<InitiativeCard initiative={initiative} />);
      
      expect(screen.getByText('Off Track')).toBeInTheDocument();
    });

    it('should display "Completed" status badge', () => {
      const initiative = createMockInitiative('completed');
      render(<InitiativeCard initiative={initiative} />);
      
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should handle unknown status gracefully', () => {
      const initiative = createMockInitiative('unknown' as any);
      render(<InitiativeCard initiative={initiative} />);
      
      // Should show "Unknown" or fallback
      const badge = screen.getByText('Unknown');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Status Colors', () => {
    it('should apply correct color class for not_started status', () => {
      const initiative = createMockInitiative('not_started');
      const { container } = render(<InitiativeCard initiative={initiative} />);
      
      const badge = screen.getByText('Not Started');
      expect(badge).toHaveClass('bg-blue-500');
    });

    it('should apply correct color class for on_track status', () => {
      const initiative = createMockInitiative('on_track');
      render(<InitiativeCard initiative={initiative} />);
      
      const badge = screen.getByText('On Track');
      expect(badge).toHaveClass('bg-green-500');
    });

    it('should apply correct color class for at_risk status', () => {
      const initiative = createMockInitiative('at_risk');
      render(<InitiativeCard initiative={initiative} />);
      
      const badge = screen.getByText('At Risk');
      expect(badge).toHaveClass('bg-yellow-500');
    });

    it('should apply correct color class for off_track status', () => {
      const initiative = createMockInitiative('off_track');
      render(<InitiativeCard initiative={initiative} />);
      
      const badge = screen.getByText('Off Track');
      expect(badge).toHaveClass('bg-red-500');
    });

    it('should apply correct color class for completed status', () => {
      const initiative = createMockInitiative('completed');
      render(<InitiativeCard initiative={initiative} />);
      
      const badge = screen.getByText('Completed');
      expect(badge).toHaveClass('bg-purple-500');
    });
  });

  describe('Card Rendering', () => {
    it('should render initiative title', () => {
      const initiative = createMockInitiative();
      render(<InitiativeCard initiative={initiative} />);
      
      expect(screen.getByText('Test Strategic Initiative')).toBeInTheDocument();
    });

    it('should render initiative description', () => {
      const initiative = createMockInitiative();
      render(<InitiativeCard initiative={initiative} />);
      
      expect(screen.getByText('Test description')).toBeInTheDocument();
    });

    it('should render owner information', () => {
      const initiative = createMockInitiative();
      render(<InitiativeCard initiative={initiative} />);
      
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });
  });
});

