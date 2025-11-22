import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { SIPanelContent } from '@/components/rcdo/SIPanelContent';
import type { Node } from 'reactflow';
import type { Tables } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import * as useSIWithProgressModule from '@/hooks/useSIWithProgress';
import * as useRolesModule from '@/hooks/useRoles';

// Mock dependencies
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
  },
}));

vi.mock('@/hooks/useSIWithProgress');
vi.mock('@/hooks/useRoles');

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('SIPanelContent - Status Field', () => {
  const mockUser = { id: 'user-1', email: 'test@example.com' };
  
  const mockDoNode: Node = {
    id: 'do-1',
    type: 'do',
    position: { x: 0, y: 0 },
    data: {
      title: 'Test DO',
      status: 'draft',
    },
  };

  const mockSI = {
    id: 'si-1',
    title: 'Test SI',
    ownerId: 'user-1',
    dbId: 'si-db-1',
  };

  const mockProfiles: Tables<'profiles'>[] = [
    {
      id: 'user-1',
      first_name: 'Test',
      last_name: 'User',
      full_name: 'Test User',
      email: 'test@example.com',
      is_admin: false,
      is_super_admin: false,
      is_rcdo_admin: false,
    } as Tables<'profiles'>,
  ];

  const mockProfilesMap: Record<string, Tables<'profiles'>> = {
    'user-1': mockProfiles[0],
  };

  const mockDoLockedStatus = new Map([
    ['do-1', { locked: false, dbId: 'do-db-1' }],
  ]);

  const defaultProps = {
    doNode: mockDoNode,
    si: mockSI,
    profiles: mockProfiles,
    profilesMap: mockProfilesMap,
    doLockedStatus: mockDoLockedStatus,
    onUpdate: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    isDoPanelOpen: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: mockUser },
      error: null,
    } as any);
    
    vi.mocked(useRolesModule.useRoles).mockReturnValue({
      isAdmin: false,
      isSuperAdmin: false,
      isRCDOAdmin: false,
      loading: false,
    });

    vi.mocked(useSIWithProgressModule.useSIWithProgress).mockReturnValue({
      siData: {
        id: 'si-db-1',
        status: 'not_started',
        locked_at: null,
      },
      loading: false,
      refetch: vi.fn(),
    } as any);
  });

  describe('Status Field Rendering', () => {
    it('should render status select field', () => {
      render(<SIPanelContent {...defaultProps} />);
      
      expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    });

    it('should display current status value', async () => {
      render(<SIPanelContent {...defaultProps} />);
      
      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toHaveTextContent('Not Started');
      });
    });

    it('should show all PRD status options', async () => {
      const user = userEvent.setup();
      render(<SIPanelContent {...defaultProps} />);
      
      const select = screen.getByRole('combobox');
      await user.click(select);
      
      await waitFor(() => {
        expect(screen.getByText('Not Started')).toBeInTheDocument();
        expect(screen.getByText('On Track')).toBeInTheDocument();
        expect(screen.getByText('At Risk')).toBeInTheDocument();
        expect(screen.getByText('Off Track')).toBeInTheDocument();
        expect(screen.getByText('Completed')).toBeInTheDocument();
      });
    });
  });

  describe('Status Field Permissions', () => {
    it('should be enabled when SI is unlocked', () => {
      vi.mocked(useSIWithProgressModule.useSIWithProgress).mockReturnValue({
        siData: {
          id: 'si-db-1',
          status: 'not_started',
          locked_at: null,
        },
        loading: false,
        refetch: vi.fn(),
      } as any);

      render(<SIPanelContent {...defaultProps} />);
      
      const select = screen.getByRole('combobox');
      expect(select).not.toBeDisabled();
    });

    it('should be enabled when user is admin even if locked', () => {
      vi.mocked(useRolesModule.useRoles).mockReturnValue({
        isAdmin: true,
        isSuperAdmin: false,
        isRCDOAdmin: false,
        loading: false,
      });

      vi.mocked(useSIWithProgressModule.useSIWithProgress).mockReturnValue({
        siData: {
          id: 'si-db-1',
          status: 'not_started',
          locked_at: '2024-01-01T00:00:00Z',
        },
        loading: false,
        refetch: vi.fn(),
      } as any);

      const lockedStatus = new Map([
        ['do-1', { locked: true, dbId: 'do-db-1' }],
      ]);

      render(<SIPanelContent {...defaultProps} doLockedStatus={lockedStatus} />);
      
      const select = screen.getByRole('combobox');
      expect(select).not.toBeDisabled();
    });

    it('should be enabled when user is SI owner even if locked', () => {
      vi.mocked(useSIWithProgressModule.useSIWithProgress).mockReturnValue({
        siData: {
          id: 'si-db-1',
          status: 'not_started',
          locked_at: '2024-01-01T00:00:00Z',
        },
        loading: false,
        refetch: vi.fn(),
      } as any);

      const lockedStatus = new Map([
        ['do-1', { locked: true, dbId: 'do-db-1' }],
      ]);

      render(<SIPanelContent {...defaultProps} doLockedStatus={lockedStatus} />);
      
      const select = screen.getByRole('combobox');
      expect(select).not.toBeDisabled();
    });

    it('should be disabled when SI is locked and user is not owner/admin', () => {
      vi.mocked(useRolesModule.useRoles).mockReturnValue({
        isAdmin: false,
        isSuperAdmin: false,
        isRCDOAdmin: false,
        loading: false,
      });

      vi.mocked(useSIWithProgressModule.useSIWithProgress).mockReturnValue({
        siData: {
          id: 'si-db-1',
          status: 'not_started',
          locked_at: '2024-01-01T00:00:00Z',
        },
        loading: false,
        refetch: vi.fn(),
      } as any);

      const lockedStatus = new Map([
        ['do-1', { locked: true, dbId: 'do-db-1' }],
      ]);

      const otherUserSI = {
        ...mockSI,
        ownerId: 'other-user',
      };

      render(
        <SIPanelContent
          {...defaultProps}
          si={otherUserSI}
          doLockedStatus={lockedStatus}
        />
      );
      
      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
    });
  });

  describe('Status Updates', () => {
    it('should update status when user selects new value', async () => {
      const user = userEvent.setup();
      const mockRefetch = vi.fn();
      
      vi.mocked(useSIWithProgressModule.useSIWithProgress).mockReturnValue({
        siData: {
          id: 'si-db-1',
          status: 'not_started',
          locked_at: null,
        },
        loading: false,
        refetch: mockRefetch,
      } as any);

      render(<SIPanelContent {...defaultProps} />);
      
      const select = screen.getByRole('combobox');
      await user.click(select);
      
      await waitFor(() => {
        expect(screen.getByText('On Track')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('On Track'));
      
      await waitFor(() => {
        expect(supabase.from).toHaveBeenCalledWith('rc_strategic_initiatives');
      });
    });

    it('should persist status change to database when SI has dbId', async () => {
      const user = userEvent.setup();
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      }));
      
      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
      } as any);

      vi.mocked(useSIWithProgressModule.useSIWithProgress).mockReturnValue({
        siData: {
          id: 'si-db-1',
          status: 'not_started',
          locked_at: null,
        },
        loading: false,
        refetch: vi.fn(),
      } as any);

      render(<SIPanelContent {...defaultProps} />);
      
      const select = screen.getByRole('combobox');
      await user.click(select);
      
      await waitFor(() => {
        expect(screen.getByText('On Track')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('On Track'));
      
      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith({ status: 'on_track' });
      });
    });

    it('should not persist when SI has no dbId', async () => {
      const user = userEvent.setup();
      const siWithoutDbId = {
        ...mockSI,
        dbId: undefined,
      };

      render(<SIPanelContent {...defaultProps} si={siWithoutDbId} />);
      
      const select = screen.getByRole('combobox');
      await user.click(select);
      
      await waitFor(() => {
        expect(screen.getByText('On Track')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('On Track'));
      
      // Should not call supabase.from for update
      await waitFor(() => {
        expect(supabase.from).not.toHaveBeenCalled();
      }, { timeout: 1000 });
    });
  });
});

