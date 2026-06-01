import { useNavigate, useLocation } from "react-router-dom";
import GridBackground from "@/components/ui/grid-background";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useEffect, lazy, Suspense } from "react";
import DashboardMain from "./DashboardMain";
const StrategyHome = lazy(() => import("./StrategyHome"));
const LazyCheckinsPage = lazy(() => import("./Checkins"));
const LazyCommitmentsPage = lazy(() => import("./Commitments"));
const LazyInsightsPage = lazy(() => import("./Insights"));
const LazyChiefOfStaffPage = lazy(() => import("./ChiefOfStaff"));
import { useActiveCycle } from "@/hooks/useRCDO";
import { useRoles } from "@/hooks/useRoles";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileBottomNav } from "@/components/ui/mobile-bottom-nav";
import { AppNavbar } from "@/components/ui/app-navbar";

const DashboardWithTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { isAdmin, isSuperAdmin } = useRoles();
  const showInsights = isAdmin || isSuperAdmin;

  // Determine active tab from URL (used for TabsContent visibility + canvas redirect)
  const activeTab = location.pathname.includes('/insights')
    ? 'insights'
    : location.pathname.includes('/chief-of-staff')
    ? 'cos'
    : location.pathname.includes('/dashboard/rcdo/tasks-feed')
    ? 'tasks'
    : location.pathname.includes('/dashboard/rcdo')
    ? 'rcdo'
    : location.pathname.includes('/workspace')
    ? 'checkins'
    : location.pathname.includes('/commitments')
    ? 'commitments'
    : location.pathname.includes('/my-meetings')
    ? 'main'
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
      <AppNavbar />

      <Tabs value={activeTab} className="w-full">
        <TabsContent value="cos" className={isMobile ? "mt-0 pb-20" : "mt-0"}>
          {activeTab === 'cos' ? (
            <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Chief of Staff…</div>}>
              <LazyChiefOfStaffPage />
            </Suspense>
          ) : null}
        </TabsContent>

        <TabsContent value="checkins" className={isMobile ? "mt-0 pb-20" : "mt-0"}>
          {activeTab === 'checkins' ? (
            <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Check-ins…</div>}>
              {/* Lazy import to keep initial bundle small */}
              <LazyCheckinsPage />
            </Suspense>
          ) : null}
        </TabsContent>

        <TabsContent value="main" className={isMobile ? "mt-0 pb-20" : "mt-0"}>
          <DashboardMain />
        </TabsContent>

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
