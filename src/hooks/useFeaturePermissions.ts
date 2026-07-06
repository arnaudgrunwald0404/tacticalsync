import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles, type RoleTag } from "./useRoles";

export type FeatureKey =
  | "view_chief_of_staff"
  | "view_my_lists"
  | "view_daily_checkin"
  | "view_my_team"
  | "view_rcdo"
  | "view_commitments"
  | "view_meetings"
  | "view_insights"
  | "view_settings"
  | "manage_permissions";

export const ALL_FEATURE_KEYS: FeatureKey[] = [
  "view_chief_of_staff",
  "view_my_lists",
  "view_daily_checkin",
  "view_my_team",
  "view_rcdo",
  "view_commitments",
  "view_meetings",
  "view_insights",
  "view_settings",
  "manage_permissions",
];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  view_chief_of_staff: "Check-Ins",
  view_my_lists: "My Lists",
  view_daily_checkin: "Daily Check-in",
  view_my_team: "My Team",
  view_rcdo: "RCDO",
  view_commitments: "Commitments",
  view_meetings: "Meetings",
  view_insights: "Insights",
  view_settings: "Settings",
  manage_permissions: "Manage Permissions",
};

export const FEATURE_DESCRIPTIONS: Record<FeatureKey, string> = {
  view_chief_of_staff: "Access the Check-Ins section",
  view_my_lists: "View my list within Check-Ins",
  view_daily_checkin: "View daily check-in within Check-Ins",
  view_my_team: "View my teams",
  view_rcdo: "Access the RCDO strategy section",
  view_commitments: "Access the Commitments section",
  view_meetings: "Access the Meetings section",
  view_insights: "Access the Insights analytics page",
  view_settings: "Access the Settings page",
  manage_permissions: "Change feature permissions for roles",
};

export const CHILD_FEATURES: Partial<Record<FeatureKey, FeatureKey[]>> = {
  view_chief_of_staff: ["view_my_lists", "view_daily_checkin", "view_my_team"],
};

export const FEATURE_CATEGORIES: Array<{ category: string; features: FeatureKey[] }> = [
  {
    category: "Feature Visibility",
    features: [
      "view_chief_of_staff",
      "view_my_lists",
      "view_daily_checkin",
      "view_my_team",
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
