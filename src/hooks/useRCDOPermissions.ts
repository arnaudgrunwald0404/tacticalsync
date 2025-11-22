import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoles } from './useRoles';

interface RCDOPermissionsState {
  canCreateCycle: boolean;
  canEditCycle: (cycleCreatorId: string) => boolean;
  canDeleteCycle: boolean;
  canCreateRallyingCry: (cycleCreatorId: string) => boolean;
  canEditRallyingCry: (ownerId: string, lockedAt: string | null) => boolean;
  canLockRallyingCry: boolean;
  canCreateDO: (cycleCreatorId: string) => boolean;
  canEditDO: (ownerId: string, lockedAt: string | null) => boolean;
  canLockDO: boolean;
  canEditMetric: (doOwnerId: string, doLockedAt: string | null) => boolean;
  canCreateInitiative: (doOwnerId: string) => boolean;
  canEditInitiative: (initiativeOwnerId: string, initiativeLockedAt: string | null) => boolean;
  canCreateTask: (siId: string) => boolean;
  canEditTask: (taskOwnerId: string, siOwnerId?: string) => boolean;
  canDeleteTask: (taskOwnerId: string, siOwnerId?: string) => boolean;
  loading: boolean;
}

/**
 * Hook to manage RCDO-specific permissions (company-wide)
 * Based on admin/super admin/RCDO admin status and ownership
 */
export function useRCDOPermissions(): RCDOPermissionsState {
  const { isAdmin, isSuperAdmin, isRCDOAdmin, loading: rolesLoading } = useRoles();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
        }
      } finally {
        setLoading(false);
      }
    };

    if (!rolesLoading) {
      fetchUserData();
    }
  }, [rolesLoading]);

  // RCDO Admins can create cycles and lock/finalize RCDOs
  const canCreateCycle = isAdmin || isSuperAdmin || isRCDOAdmin;
  const canDeleteCycle = isSuperAdmin;
  const canLockRallyingCry = isSuperAdmin || isRCDOAdmin;
  const canLockDO = isSuperAdmin || isRCDOAdmin;

  const canEditCycle = useCallback(
    (cycleCreatorId: string): boolean => {
      if (isSuperAdmin) return true;
      if (isRCDOAdmin) return true;
      if (isAdmin) return true;
      if (userId === cycleCreatorId) return true;
      return false;
    },
    [userId, isAdmin, isSuperAdmin, isRCDOAdmin]
  );

  const canCreateRallyingCry = useCallback(
    (cycleCreatorId: string): boolean => {
      if (isSuperAdmin) return true;
      if (isRCDOAdmin) return true;
      if (isAdmin) return true;
      if (userId === cycleCreatorId) return true;
      return false;
    },
    [userId, isAdmin, isSuperAdmin, isRCDOAdmin]
  );

  const canEditRallyingCry = useCallback(
    (ownerId: string, lockedAt: string | null): boolean => {
      if (isSuperAdmin) return true;
      if (isRCDOAdmin) return true;
      if (isAdmin) return true;
      if (lockedAt && !isAdmin && !isSuperAdmin && !isRCDOAdmin) return false;
      if (userId === ownerId && !lockedAt) return true;
      return false;
    },
    [userId, isAdmin, isSuperAdmin, isRCDOAdmin]
  );

  const canCreateDO = useCallback(
    (cycleCreatorId: string): boolean => {
      if (isSuperAdmin) return true;
      if (isRCDOAdmin) return true;
      if (isAdmin) return true;
      if (userId === cycleCreatorId) return true;
      return false;
    },
    [userId, isAdmin, isSuperAdmin, isRCDOAdmin]
  );

  const canEditDO = useCallback(
    (ownerId: string, lockedAt: string | null): boolean => {
      if (isSuperAdmin) return true;
      if (isRCDOAdmin) return true;
      if (isAdmin) return true;
      if (lockedAt && !isAdmin && !isSuperAdmin && !isRCDOAdmin) return false;
      if (userId === ownerId && !lockedAt) return true;
      return false;
    },
    [userId, isAdmin, isSuperAdmin, isRCDOAdmin]
  );

  const canEditMetric = useCallback(
    (doOwnerId: string, doLockedAt: string | null): boolean => {
      if (isSuperAdmin) return true;
      if (isRCDOAdmin) return true;
      if (isAdmin) return true;
      if (doLockedAt && !isAdmin && !isSuperAdmin && !isRCDOAdmin) return false;
      if (userId === doOwnerId && !doLockedAt) return true;
      return false;
    },
    [userId, isAdmin, isSuperAdmin, isRCDOAdmin]
  );

  const canCreateInitiative = useCallback(
    (doOwnerId: string): boolean => {
      if (isSuperAdmin) return true;
      if (isRCDOAdmin) return true;
      if (isAdmin) return true;
      if (userId === doOwnerId) return true;
      return false;
    },
    [userId, isAdmin, isSuperAdmin, isRCDOAdmin]
  );

  const canEditInitiative = useCallback(
    (
      initiativeOwnerId: string,
      initiativeLockedAt: string | null,
      doOwnerId?: string,
      initiativeCreatorId?: string
    ): boolean => {
      if (isSuperAdmin) return true;
      if (isRCDOAdmin) return true;
      if (isAdmin) return true;
      if (initiativeLockedAt && !isAdmin && !isSuperAdmin && !isRCDOAdmin) return false;
      if (userId === initiativeOwnerId && !initiativeLockedAt) return true; // SI owner (unlocked)
      if (doOwnerId && userId === doOwnerId) return true; // DO owner
      if (initiativeCreatorId && userId === initiativeCreatorId) return true; // SI creator
      return false;
    },
    [userId, isAdmin, isSuperAdmin, isRCDOAdmin]
  );

  const canCreateTask = useCallback(
    (siId: string): boolean => {
      // Any team member with access to the SI can create tasks
      // This will be enforced by RLS policies
      if (isSuperAdmin) return true;
      if (isRCDOAdmin) return true;
      if (isAdmin) return true;
      // For regular users, RLS will check team membership
      return true;
    },
    [isAdmin, isSuperAdmin, isRCDOAdmin]
  );

  const canEditTask = useCallback(
    (taskOwnerId: string, siOwnerId?: string): boolean => {
      if (isSuperAdmin) return true;
      if (isRCDOAdmin) return true;
      if (isAdmin) return true;
      if (userId === taskOwnerId) return true; // Task owner
      if (siOwnerId && userId === siOwnerId) return true; // SI owner
      return false;
    },
    [userId, isAdmin, isSuperAdmin, isRCDOAdmin]
  );

  const canDeleteTask = useCallback(
    (taskOwnerId: string, siOwnerId?: string): boolean => {
      if (isSuperAdmin) return true;
      if (isRCDOAdmin) return true;
      if (isAdmin) return true;
      if (userId === taskOwnerId) return true; // Task owner
      if (siOwnerId && userId === siOwnerId) return true; // SI owner
      return false;
    },
    [userId, isAdmin, isSuperAdmin, isRCDOAdmin]
  );

  return {
    canCreateCycle,
    canEditCycle,
    canDeleteCycle,
    canCreateRallyingCry,
    canEditRallyingCry,
    canLockRallyingCry,
    canCreateDO,
    canEditDO,
    canLockDO,
    canEditMetric,
    canCreateInitiative,
    canEditInitiative,
    canCreateTask,
    canEditTask,
    canDeleteTask,
    loading: loading || rolesLoading,
  };
}

