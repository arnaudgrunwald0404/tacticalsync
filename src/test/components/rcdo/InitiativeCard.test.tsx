import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { InitiativeCard } from '@/components/rcdo/InitiativeCard';
import type { StrategicInitiativeWithRelations } from '@/types/rcdo';
import { supabase } from '@/integrations/supabase/client';

// ── Types for mock query builder ────────────────────────────────────
interface MockFilter {
  column: string;
  value: unknown;
}

interface MockChainableBuilder {
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
  catch: ReturnType<typeof vi.fn>;
}

interface MockInsertBuilder {
  select: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
  catch: ReturnType<typeof vi.fn>;
}

interface MockUpdateBuilder {
  eq: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
  catch: ReturnType<typeof vi.fn>;
}

interface MockDeleteBuilder {
  eq: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
  catch: ReturnType<typeof vi.fn>;
}

interface MockTableBuilder {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

// Mock supabase with realistic CRUD operations that support chaining
const createMockQueryBuilder = (_tableName: string): MockTableBuilder => {
  // In-memory store for each table
  const store: Record<string, unknown>[] = [];

  // Helper to create chainable query builder
  const createChainableBuilder = (initialData: Record<string, unknown>[] = store): MockChainableBuilder => {
    let data = [...initialData];
    const filters: MockFilter[] = [];

    const builder: MockChainableBuilder = {
      // Filter methods
      eq: vi.fn(function(column: string, value: unknown) {
        filters.push({ column, value });
        data = data.filter(item => item[column] === value);
        return builder;
      }),

      order: vi.fn(function(column: string, options?: { ascending?: boolean; nullsLast?: boolean }) {
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
        return builder;
      }),

      // Return methods that resolve to promises
      then: vi.fn(function(onResolve?: (v: { data: Record<string, unknown>[]; error: null }) => unknown, onReject?: (e: unknown) => unknown) {
        return Promise.resolve({ data, error: null }).then(onResolve, onReject);
      }),

      catch: vi.fn(function(onReject?: (e: unknown) => unknown) {
        return Promise.resolve({ data, error: null }).catch(onReject);
      }),
    };

    // Make it thenable
    Object.setPrototypeOf(builder, Promise.prototype);

    return builder;
  };

  const tableBuilder: MockTableBuilder = {
    // SELECT operations
    select: vi.fn((_columns?: string) => {
      return createChainableBuilder();
    }),

    // INSERT operations
    insert: vi.fn((data: Record<string, unknown> | Record<string, unknown>[]) => {
      const inserted = Array.isArray(data) ? data : [data];
      inserted.forEach(item => {
        const newItem = { ...item };
        if (!newItem['id']) newItem['id'] = `mock-${Date.now()}-${Math.random()}`;
        if (!newItem['created_at']) newItem['created_at'] = new Date().toISOString();
        if (!newItem['updated_at']) newItem['updated_at'] = new Date().toISOString();
        store.push(newItem);
      });

      const insertBuilder: MockInsertBuilder = {
        select: vi.fn(() => {
          return createChainableBuilder(inserted);
        }),
        single: vi.fn(() => {
          return Promise.resolve({ data: inserted[0] || null, error: null });
        }),
        then: vi.fn((onResolve?: (v: { data: Record<string, unknown>[]; error: null }) => unknown, onReject?: (e: unknown) => unknown) => {
          return Promise.resolve({ data: inserted, error: null }).then(onResolve, onReject);
        }),
        catch: vi.fn((onReject?: (e: unknown) => unknown) => {
          return Promise.resolve({ data: inserted, error: null }).catch(onReject);
        }),
      };
      Object.setPrototypeOf(insertBuilder, Promise.prototype);
      return insertBuilder;
    }),

    // UPDATE operations
    update: vi.fn((data: Record<string, unknown>) => {
      const updateBuilder: MockUpdateBuilder = {
        eq: vi.fn(function(column: string, value: unknown) {
          const updated: Record<string, unknown>[] = [];
          store.forEach((item, index) => {
            if (item[column] === value) {
              store[index] = { ...item, ...data, updated_at: new Date().toISOString() };
              updated.push(store[index]);
            }
          });
          return Promise.resolve({ data: updated, error: null });
        }),
        then: vi.fn((onResolve?: (v: { data: Record<string, unknown>[]; error: null }) => unknown, onReject?: (e: unknown) => unknown) => {
          return Promise.resolve({ data: [], error: null }).then(onResolve, onReject);
        }),
        catch: vi.fn((onReject?: (e: unknown) => unknown) => {
          return Promise.resolve({ data: [], error: null }).catch(onReject);
        }),
      };
      Object.setPrototypeOf(updateBuilder, Promise.prototype);
      return updateBuilder;
    }),

    // DELETE operations
    delete: vi.fn(() => {
      const deleteBuilder: MockDeleteBuilder = {
        eq: vi.fn(function(column: string, value: unknown) {
          const initialLength = store.length;
          const filtered = store.filter(item => item[column] !== value);
          store.length = 0;
          store.push(...filtered);
          const deleted = initialLength - store.length;
          return Promise.resolve({ data: deleted > 0 ? [{ id: value }] : [], error: null });
        }),
        then: vi.fn((onResolve?: (v: { data: Record<string, unknown>[]; error: null }) => unknown, onReject?: (e: unknown) => unknown) => {
          const deleted = [...store];
          store.length = 0;
          return Promise.resolve({ data: deleted, error: null }).then(onResolve, onReject);
        }),
        catch: vi.fn((onReject?: (e: unknown) => unknown) => {
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
    } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);
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
      const initiative = createMockInitiative('unknown' as StrategicInitiativeWithRelations['status']);
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
