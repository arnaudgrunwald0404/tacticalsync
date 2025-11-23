import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { InitiativeCard } from '@/components/rcdo/InitiativeCard';
import type { StrategicInitiativeWithRelations } from '@/types/rcdo';
import { supabase } from '@/integrations/supabase/client';

// Mock supabase with realistic CRUD operations that support chaining
const createMockQueryBuilder = (tableName: string) => {
  // In-memory store for each table
  const store: any[] = [];
  
  // Helper to create chainable query builder
  const createChainableBuilder = (initialData: any[] = store) => {
    let data = [...initialData];
    let filters: Array<{ column: string; value: any }> = [];
    
    const builder: any = {
      // Filter methods
      eq: vi.fn(function(this: any, column: string, value: any) {
        filters.push({ column, value });
        data = data.filter(item => item[column] === value);
        return this;
      }),
      
      order: vi.fn(function(this: any, column: string, options?: { ascending?: boolean; nullsLast?: boolean }) {
        const ascending = options?.ascending !== false;
        data.sort((a, b) => {
          const aVal = a[column];
          const bVal = b[column];
          if (aVal == null && bVal == null) return 0;
          if (aVal == null) return options?.nullsLast ? 1 : -1;
          if (bVal == null) return options?.nullsLast ? -1 : 1;
          if (aVal < bVal) return ascending ? -1 : 1;
          if (aVal > bVal) return ascending ? 1 : -1;
          return 0;
        });
        return this;
      }),
      
      // Return methods that resolve to promises
      then: vi.fn(function(this: any, onResolve?: any, onReject?: any) {
        return Promise.resolve({ data, error: null }).then(onResolve, onReject);
      }),
      
      catch: vi.fn(function(this: any, onReject?: any) {
        return Promise.resolve({ data, error: null }).catch(onReject);
      }),
    };
    
    // Make it thenable
    builder.then[Symbol.toStringTag] = 'Promise';
    Object.setPrototypeOf(builder, Promise.prototype);
    
    return builder;
  };
  
  const tableBuilder = {
    // SELECT operations
    select: vi.fn((columns?: string) => {
      return createChainableBuilder();
    }),
    
    // INSERT operations
    insert: vi.fn((data: any) => {
      const inserted = Array.isArray(data) ? data : [data];
      inserted.forEach(item => {
        const newItem = { ...item };
        if (!newItem.id) newItem.id = `mock-${Date.now()}-${Math.random()}`;
        if (!newItem.created_at) newItem.created_at = new Date().toISOString();
        if (!newItem.updated_at) newItem.updated_at = new Date().toISOString();
        store.push(newItem);
      });
      
      const insertBuilder: any = {
        select: vi.fn(() => {
          return createChainableBuilder(inserted);
        }),
        single: vi.fn(() => {
          return Promise.resolve({ data: inserted[0] || null, error: null });
        }),
        then: vi.fn((onResolve?: any, onReject?: any) => {
          return Promise.resolve({ data: inserted, error: null }).then(onResolve, onReject);
        }),
        catch: vi.fn((onReject?: any) => {
          return Promise.resolve({ data: inserted, error: null }).catch(onReject);
        }),
      };
      Object.setPrototypeOf(insertBuilder, Promise.prototype);
      return insertBuilder;
    }),
    
    // UPDATE operations
    update: vi.fn((data: any) => {
      const updateBuilder: any = {
        eq: vi.fn(function(this: any, column: string, value: any) {
          const updated: any[] = [];
          store.forEach((item, index) => {
            if (item[column] === value) {
              store[index] = { ...item, ...data, updated_at: new Date().toISOString() };
              updated.push(store[index]);
            }
          });
          const result = Promise.resolve({ data: updated, error: null });
          return result;
        }),
        then: vi.fn((onResolve?: any, onReject?: any) => {
          return Promise.resolve({ data: [], error: null }).then(onResolve, onReject);
        }),
        catch: vi.fn((onReject?: any) => {
          return Promise.resolve({ data: [], error: null }).catch(onReject);
        }),
      };
      Object.setPrototypeOf(updateBuilder, Promise.prototype);
      return updateBuilder;
    }),
    
    // DELETE operations
    delete: vi.fn(() => {
      const deleteBuilder: any = {
        eq: vi.fn(function(this: any, column: string, value: any) {
          const initialLength = store.length;
          const filtered = store.filter(item => item[column] !== value);
          store.length = 0;
          store.push(...filtered);
          const deleted = initialLength - store.length;
          return Promise.resolve({ data: deleted > 0 ? [{ id: value }] : [], error: null });
        }),
        then: vi.fn((onResolve?: any, onReject?: any) => {
          const deleted = [...store];
          store.length = 0;
          return Promise.resolve({ data: deleted, error: null }).then(onResolve, onReject);
        }),
        catch: vi.fn((onReject?: any) => {
          return Promise.resolve({ data: [], error: null }).catch(onReject);
        }),
      };
      Object.setPrototypeOf(deleteBuilder, Promise.prototype);
      return deleteBuilder;
    }),
  };
  
  return tableBuilder;
};

// Store mock data per table
const mockTables: Record<string, ReturnType<typeof createMockQueryBuilder>> = {};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn((tableName: string) => {
      if (!mockTables[tableName]) {
        mockTables[tableName] = createMockQueryBuilder(tableName);
      }
      return mockTables[tableName];
    }),
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
    it('should display "Draft" status badge for not_started', () => {
      const initiative = createMockInitiative('not_started');
      render(<InitiativeCard initiative={initiative} />);
      
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('should display "On Track" status badge', () => {
      const initiative = createMockInitiative('on_track');
      render(<InitiativeCard initiative={initiative} />);
      
      expect(screen.getByText('On Track')).toBeInTheDocument();
    });

    it('should display "Delayed" status badge for at_risk', () => {
      const initiative = createMockInitiative('at_risk');
      render(<InitiativeCard initiative={initiative} />);
      
      expect(screen.getByText('Delayed')).toBeInTheDocument();
    });

    it('should display "Delayed" status badge for off_track', () => {
      const initiative = createMockInitiative('off_track');
      render(<InitiativeCard initiative={initiative} />);
      
      expect(screen.getByText('Delayed')).toBeInTheDocument();
    });

    it('should display "On Track" status badge for completed', () => {
      const initiative = createMockInitiative('completed');
      render(<InitiativeCard initiative={initiative} />);
      
      expect(screen.getByText('On Track')).toBeInTheDocument();
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
      
      const badge = screen.getByText('Draft');
      expect(badge).toHaveClass('bg-[#5B6E7A]');
    });

    it('should apply correct color class for on_track status', () => {
      const initiative = createMockInitiative('on_track');
      render(<InitiativeCard initiative={initiative} />);
      
      const badge = screen.getByText('On Track');
      expect(badge).toHaveClass('bg-[#6FA87F]');
    });

    it('should apply correct color class for at_risk status', () => {
      const initiative = createMockInitiative('at_risk');
      render(<InitiativeCard initiative={initiative} />);
      
      const badge = screen.getByText('Delayed');
      expect(badge).toHaveClass('bg-yellow-500');
    });

    it('should apply correct color class for off_track status', () => {
      const initiative = createMockInitiative('off_track');
      render(<InitiativeCard initiative={initiative} />);
      
      const badge = screen.getByText('Delayed');
      expect(badge).toHaveClass('bg-yellow-500');
    });

    it('should apply correct color class for completed status', () => {
      const initiative = createMockInitiative('completed');
      render(<InitiativeCard initiative={initiative} />);
      
      const badge = screen.getByText('On Track');
      expect(badge).toHaveClass('bg-[#6FA87F]');
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

