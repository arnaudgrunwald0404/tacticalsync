import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles, type RoleTag } from "./useRoles";

export type FeatureKey =
  | "view_chief_of_staff"
  | "view_dci_lists"
  | "view_teams_lists"
  | "view_dashboard"
  | "view_rcdo"
  | "view_commitments"
  | "view_meetings"
  | "view_insights"
  | "view_settings"
  | "manage_permissions";

export const ALL_FEATURE_KEYS: FeatureKey[] = [
  "view_chief_of_staff",
  "view_dci_lists",
  "view_teams_lists",
  "view_dashboard",
  "view_rcdo",
  "view_commitments",
  "view_meetings",
  "view_insights",
  "view_settings",
  "manage_permissions",
];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  view_chief_of_staff: "Chief of Staff",
  view_dci_lists: "DCI Lists",
  view_teams_lists: "Teams Lists",
  view_dashboard: "My Dashboard",
  view_rcdo: "RCDO",
  view_commitments: "Commitments",
  view_meetings: "Meetings",
  view_insights: "Insights",
  view_settings: "Settings",
  manage_permissions: "Manage Permissions",
};

export const FEATURE_DESCRIPTIONS: Record<FeatureKey, string> = {
  view_chief_of_staff: "Access the Chief of Staff section",
  view_dci_lists: "View DCI lists within Chief of Staff",
  view_teams_lists: "View Teams lists within Chief of Staff",
  view_dashboard: "Access the personal dashboard",
  view_rcdo: "Access the RCDO strategy section",
  view_commitments: "Access the Commitments section",
  view_meetings: "Access the Meetings section",
  view_insights: "Access the Insights analytics page",
  view_settings: "Access the Settings page",
  manage_permissions: "Change feature permissions for roles",
};

export const FEATURE_CATEGORIES: Array<{ category: string; features: FeatureKey[] }> = [
  {
    category: "Feature Visibility",
    features: [
      "view_chief_of_staff",
      "view_dci_lists",
      "view_teams_lists",
      "view_dashboard",
      "view_rcdo",
      "view_commitments",
      "view_meetings",
      "view_insights",
      "view_settings",
    ],
  },
  {
    category: "Administration",
    features: ["manage_permissions"],
  },
];

interface PermissionRow {
  feature_key: string;
  role_tag: string;
  is_enabled: boolean;
}

interface FeaturePermissionsState {
  canAccess: (feature: FeatureKey) => boolean;
  permissions: PermissionRow[];
  loading: boolean;
  refetch: () => Promise<void>;
  canManagePermissions: boolean;
}

export function useFeaturePermissions(): FeaturePermissionsState {
  const { roleTags, isSuperAdmin, loading: rolesLoading } = useRoles();
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    const { data, error } = await supabase
      .from("feature_permissions")
      .select("feature_key, role_tag, is_enabled");

    if (!error && data) {
      setPermissions(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const canAccess = useCallback(
    (feature: FeatureKey): boolean => {
      if (isSuperAdmin) return true;
      if (rolesLoading || loading || permissions.length === 0) return true;
      return roleTags.some((tag) =>
        permissions.some(
          (p) => p.feature_key === feature && p.role_tag === tag && p.is_enabled
        )
      );
    },
    [isSuperAdmin, rolesLoading, loading, roleTags, permissions]
  );

  const canManagePermissions = isSuperAdmin || canAccess("manage_permissions");

  return { canAccess, permissions, loading: loading || rolesLoading, refetch: fetchPermissions, canManagePermissions };
}
