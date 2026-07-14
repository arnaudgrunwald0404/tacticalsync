import { useNavigate, useLocation } from "react-router-dom";
import GridBackground from "@/components/ui/grid-background";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useEffect, useState, Suspense } from "react";
// Deprecated: RCDO meetings feature — no longer used (see the "main" tab below).
// import DashboardMain from "./DashboardMain";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
const StrategyHome = lazyWithRetry(() => import("./StrategyHome"));
const LazyCommitmentsPage = lazyWithRetry(() => import("./Commitments"));
const LazyInsightsPage = lazyWithRetry(() => import("./Insights"));
const LazyChiefOfStaffPage = lazyWithRetry(() => import("./ChiefOfStaff"));
import { useActiveCycle } from "@/hooks/useRCDO";
import { useRoles } from "@/hooks/useRoles";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { supabase } from "@/integrations/supabase/client";
import { MobileBottomNav } from "@/components/ui/mobile-bottom-nav";

const DashboardWithTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { isAdmin, isSuperAdmin } = useRoles();

  // PLAN_idea9_manager_signals.md §6.1/§8: the Insights tab is no longer
  // admin-only — a manager with direct reports (tracked in cos_team_members)
  // needs it too, for the manager-signals/coaching-prep section. Admins keep
  // access to the existing priority-analysis content on the same page.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);
  const cosMembers = useTeamMembers(currentUserId);
  const hasDirectReports = cosMembers.some((m) => m.relationship_type === "direct_report");
  const showInsights = isAdmin || isSuperAdmin || hasDirectReports;

  // Determine active tab from URL (used for TabsContent visibility + canvas redirect)
  const activeTab = location.pathname.includes('/insights')
    ? 'insights'
    : location.pathname.includes('/check-ins')
    ? 'cos'
    : location.pathname.includes('/dashboard/rcdo/tasks-feed')
    ? 'tasks'
    : location.pathname.includes('/dashboard/rcdo')
    ? 'rcdo'
    : location.pathname.includes('/commitments')
    ? 'commitments'
    // Deprecated: RCDO meetings feature — /my-meetings no longer routes here.
    : 'main';

  // Fetch active cycle to auto-route to canvas when RCDO tab is selected
  const { cycle: activeCycle, loading: activeCycleLoading } = useActiveCycle();

  // When on /dashboard/rcdo base path, send user to the active canvas if available
  // Skip redirect when ?list=true is set (user explicitly chose "View all strategies")
  useEffect(() => {
    if (activeTab !== 'rcdo') return;
    const path = location.pathname.replace(/\/$/, '');
    const params = new URLSearchParams(location.search);
    if (path === '/dashboard/rcdo' && !params.has('list') && !activeCycleLoading) {
      if (activeCycle?.id) {
        navigate(`/rcdo/canvas?cycle=${activeCycle.id}`, { replace: true });
      }
    }
  }, [activeTab, location.pathname, location.search, activeCycleLoading, activeCycle?.id, navigate]);

  return (
    <GridBackground inverted className="min-h-screen bg-gradient-to-br from-platinum via-white to-white-gold overscroll-none">
      <Tabs value={activeTab} className="w-full">
        <TabsContent value="cos" className={isMobile ? "mt-0 pb-20" : "mt-0"}>
          {activeTab === 'cos' ? (
            <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Check-Ins…</div>}>
              <LazyChiefOfStaffPage />
            </Suspense>
          ) : null}
        </TabsContent>

        {/* Deprecated: RCDO meetings feature — no longer used.
        <TabsContent value="main" className={isMobile ? "mt-0 pb-20" : "mt-0"}>
          <DashboardMain />
        </TabsContent>
        */}

        <TabsContent value="rcdo" className={isMobile ? "mt-0 pb-20" : "mt-0"}>
          {activeTab === 'rcdo' ? (
            <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading RCDO…</div>}>
              <StrategyHome />
            </Suspense>
          ) : null}
        </TabsContent>

        <TabsContent value="commitments" className={isMobile ? "mt-0 pb-20" : "mt-0"}>
          {activeTab === 'commitments' ? (
            <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Commitments…</div>}>
              <LazyCommitmentsPage />
            </Suspense>
          ) : null}
        </TabsContent>

        {showInsights && (
          <TabsContent value="insights" className={isMobile ? "mt-0 pb-20" : "mt-0"}>
            {activeTab === 'insights' ? (
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Insights…</div>}>
                <LazyInsightsPage />
              </Suspense>
            ) : null}
          </TabsContent>
        )}
      </Tabs>

      {/* Mobile Bottom Navigation */}
      {isMobile && <MobileBottomNav />}
    </GridBackground>
  );
};

export default DashboardWithTabs;
