import { useNavigate, useLocation } from "react-router-dom";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { useEffect, lazy, Suspense } from "react";
import DashboardMain from "./DashboardMain";
const StrategyHome = lazy(() => import("./StrategyHome"));
const LazyCheckinsPage = lazy(() => import("./Checkins"));
const LazyCommitmentsPage = lazy(() => import("./Commitments"));
const LazyInsightsPage = lazy(() => import("./Insights"));
import { useActiveCycle } from "@/hooks/useRCDO";
import { useRoles } from "@/hooks/useRoles";
import { UserProfileHeader } from "@/components/ui/user-profile-header";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileBottomNav } from "@/components/ui/mobile-bottom-nav";

const DashboardWithTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { isAdmin, isSuperAdmin } = useRoles();
  const showInsights = isAdmin || isSuperAdmin;

  // Determine active tab from URL
  const activeTab = location.pathname.includes('/insights')
    ? 'insights'
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

  const handleTabChange = (value: string) => {
    if (value === 'main') {
      navigate('/my-meetings');
    } else if (value === 'rcdo') {
      navigate('/dashboard/rcdo');
    } else if (value === 'checkins') {
      navigate('/workspace');
    } else if (value === 'commitments') {
      navigate('/commitments');
    } else if (value === 'insights') {
      navigate('/insights');
    }
  };

  // When on /dashboard/rcdo base path, send user to the active canvas if available
  useEffect(() => {
    if (activeTab !== 'rcdo') return;
    const path = location.pathname.replace(/\/$/, '');
    if (path === '/dashboard/rcdo' && !activeCycleLoading) {
      if (activeCycle?.id) {
        navigate(`/rcdo/canvas?cycle=${activeCycle.id}`, { replace: true });
      }
    }
  }, [activeTab, location.pathname, activeCycleLoading, activeCycle?.id, navigate]);

  return (
    <GridBackground inverted className="min-h-screen bg-gradient-to-br from-platinum via-white to-white-gold overscroll-none">
      <header className="sticky top-0 z-50 border-b bg-white">
        <div className="container mx-auto px-4 py-3 sm:py-4 relative">
          {/* Reserve space for absolutely positioned avatar (right-4 = 1rem = 16px, plus ~180px for avatar+name) */}
          <div className="flex items-center gap-4 pr-[180px] md:pr-[200px]">
            {/* Left: Back button and Logo - Protected, won't shrink */}
            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              {activeTab !== 'main' && !isMobile && (
                <button
                  onClick={() => navigate('/my-meetings')}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap flex-shrink-0"
                >
                  <ArrowLeft className="h-4 w-4"/>
                  Back
                </button>
              )}

              <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100 flex-shrink-0"/>
            </div>

            {/* Center: Tabs - Hidden on mobile, centered with constraints to prevent overlap */}
            {!isMobile && (
              <div className="flex-1 flex justify-center min-w-0 overflow-hidden">
                <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full max-w-fit">
                  <TabsList className="h-10">
                    <TabsTrigger value="checkins" className="px-2 sm:px-4 md:px-6 whitespace-nowrap text-xs sm:text-sm">My Workspace</TabsTrigger>
                    <TabsTrigger value="main" className="px-2 sm:px-4 md:px-6 whitespace-nowrap text-xs sm:text-sm">My Meetings</TabsTrigger>
                    <TabsTrigger value="commitments" className="px-2 sm:px-4 md:px-6 whitespace-nowrap text-xs sm:text-sm">Commitments</TabsTrigger>
                    <TabsTrigger value="rcdo" className="px-2 sm:px-4 md:px-6 whitespace-nowrap text-xs sm:text-sm">RCDO</TabsTrigger>
                    {showInsights && (
                      <TabsTrigger value="insights" className="px-2 sm:px-4 md:px-6 whitespace-nowrap text-xs sm:text-sm">Insights</TabsTrigger>
                    )}
                  </TabsList>
                </Tabs>
              </div>
            )}
          </div>

          {/* Right: Avatar - UserProfileHeader handles its own absolute positioning */}
          <UserProfileHeader />
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
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
