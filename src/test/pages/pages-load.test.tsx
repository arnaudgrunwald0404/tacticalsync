import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';

// Create a chainable query builder mock
const createQueryBuilder = () => {
  const builder: any = {
    select: vi.fn(function(this: any) { return this; }),
    eq: vi.fn(function(this: any) { return this; }),
    in: vi.fn(function(this: any) { return this; }),
    order: vi.fn(function(this: any) { return this; }),
    limit: vi.fn(function(this: any) { return this; }),
    single: vi.fn(function(this: any) { return Promise.resolve({ data: null, error: null }); }),
    then: vi.fn(function(this: any, onResolve?: any) { 
      return Promise.resolve({ data: [], error: null }).then(onResolve); 
    }),
    catch: vi.fn(function(this: any, onReject?: any) { 
      return Promise.resolve({ data: [], error: null }).catch(onReject); 
    }),
  };
  return builder;
};

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(() => ({
          unsubscribe: vi.fn(),
        })),
      })),
      subscribe: vi.fn(() => ({
        unsubscribe: vi.fn(),
      })),
    })),
    from: vi.fn(() => createQueryBuilder()),
  },
}));

// Mock useParams and useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'test-id', siId: 'test-si-id', doId: 'test-do-id' }),
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

// Mock hooks that pages might use
vi.mock('@/hooks/useRCDO', () => ({
  useDODetails: () => ({ doDetails: null, loading: false, refetch: vi.fn() }),
  useDOMetrics: () => ({ metrics: [], loading: false, refetch: vi.fn(), updateMetric: vi.fn() }),
  useStrategicInitiatives: () => ({ initiatives: [], loading: false, refetch: vi.fn() }),
  useRCLinks: () => ({ links: [], loading: false, refetch: vi.fn() }),
  useCheckins: () => ({ checkins: [], loading: false, refetch: vi.fn() }),
  useActiveCycle: () => ({ cycle: null, loading: false }),
  useCycles: () => ({ cycles: [], loading: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({ tasks: [], loading: false, refetch: vi.fn() }),
  useTasksBySI: () => ({ tasks: [], loading: false, refetch: vi.fn() }),
  useTaskDetails: () => ({ task: null, loading: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useRCDORealtime', () => ({
  useRCDORealtime: () => {},
}));

vi.mock('@/hooks/useRCDOPermissions', () => ({
  useRCDOPermissions: () => ({
    canEditDO: () => false,
    canLockDO: () => false,
    canEditInitiative: () => false,
    canEditTask: () => false,
    canDeleteTask: () => false,
    canCreateTask: () => false,
  }),
}));

vi.mock('@/hooks/useRoles', () => ({
  useRoles: () => ({
    isAdmin: false,
    isSuperAdmin: false,
    isRCDOAdmin: false,
  }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

// Mock ReactFlow for StrategyCanvas
vi.mock('reactflow', () => ({
  ReactFlow: () => <div data-testid="reactflow">ReactFlow</div>,
  useReactFlow: () => ({
    getNodes: () => [],
    getEdges: () => [],
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    fitView: vi.fn(),
  }),
  useNodesState: vi.fn((initial) => [[], vi.fn(), vi.fn()]),
  useEdgesState: vi.fn((initial) => [[], vi.fn(), vi.fn()]),
  MarkerType: {
    Arrow: 'arrow',
    ArrowClosed: 'arrowclosed',
  },
  Background: () => <div>Background</div>,
  Controls: () => <div>Controls</div>,
  MiniMap: () => <div>MiniMap</div>,
  Panel: () => <div>Panel</div>,
}));

// Mock Yjs for StrategyCanvas
vi.mock('yjs', () => ({
  Doc: vi.fn(),
}));

vi.mock('y-websocket', () => ({
  WebsocketProvider: vi.fn(),
}));

// Import pages statically
import Index from '@/pages/Index';
import Auth from '@/pages/Auth';
import Dashboard from '@/pages/Dashboard';
import DashboardMain from '@/pages/DashboardMain';
import SIDetail from '@/pages/SIDetail';
import DODetail from '@/pages/DODetail';
import TasksFeed from '@/pages/TasksFeed';
import StrategyCanvas from '@/pages/StrategyCanvas';
import StrategyHome from '@/pages/StrategyHome';
import Profile from '@/pages/Profile';
import Settings from '@/pages/Settings';
import NotFound from '@/pages/NotFound';

describe('Page Load Tests - Basic Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test simpler pages that can render without complex dependencies
  it('should load NotFound page', () => {
    const { unmount } = render(<NotFound />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it('should load Dashboard page', () => {
    const { unmount } = render(<Dashboard />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it('should load SIDetail page', () => {
    const { unmount } = render(<SIDetail />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it('should load DODetail page', () => {
    const { unmount } = render(<DODetail />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it('should load TasksFeed page', () => {
    const { unmount } = render(<TasksFeed />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it('should load Profile page', () => {
    const { unmount } = render(<Profile />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it('should load Settings page', () => {
    const { unmount } = render(<Settings />);
    expect(document.body).toBeTruthy();
    unmount();
  });
});

