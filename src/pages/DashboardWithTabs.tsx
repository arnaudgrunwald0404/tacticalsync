import { useNavigate, useLocation } from "react-router-dom";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { useEffect, lazy, Suspense } from "react";
import DashboardMain from "./DashboardMain";
const StrategyHome = lazy(() => import("./StrategyHome"));
const LazyCheckinsPage = lazy(() => import("./Checkins"));
import { useActiveCycle } from "@/hooks/useRCDO";
import { UserProfileHeader } from "@/components/ui/user-profile-header";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileBottomNav } from "@/components/ui/mobile-bottom-nav";

const DashboardWithTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  // Determine active tab from URL
  const activeTab = location.pathname.includes('/dashboard/rcdo/tasks-feed')
    ? 'tasks'
    : location.pathname.includes('/dashboard/rcdo')
    ? 'rcdo'
    : location.pathname.includes('/dashboard/checkins')
    ? 'checkins'
    : 'main';

  // Fetch active cycle to auto-route to canvas when RCDO tab is selected
  const { cycle: activeCycle, loading: activeCycleLoading } = useActiveCycle();

  const handleTabChange = (value: string) => {
    if (value === 'main') {
      navigate('/dashboard/main');
    } else if (value === 'rcdo') {
      navigate('/dashboard/rcdo');
    } else if (value === 'checkins') {
      navigate('/dashboard/checkins');
    }
  };

  // When on /dashboard/rcdo base path, send user to the active canvas if available
  useEffect(() => {
    if (activeTab !== 'rcdo') return;
    const path = location.pathname.replace(/\/$/, '');
    if (path === '/dashboard/rcdo' && !activeCycleLoading) {
      if (activeCycle?.id) {
        navigate(`/dashboard/rcdo/canvas?cycle=${activeCycle.id}`, { replace: true });
      }
    }
  }, [activeTab, location.pathname, activeCycleLoading, activeCycle?.id, navigate]);

  return (
    <GridBackground inverted className="min-h-screen bg-blue-50 overscroll-none">
      <header className={`border-b bg-white ${isMobile ? 'sticky top-0 z-50' : ''}`}>
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between relative pr-20">
          {/* Left: Back button and Logo */}
          <div className="flex items-center gap-4">
            {/* Back button (only show when not on main meetings) */}
            {activeTab !== 'main' && !isMobile && (
              <button
                onClick={() => navigate('/dashboard/main')}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
            
            <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100" />
          </div>
          
          {/* Center: Tabs - Hidden on mobile */}
          {!isMobile && (
            <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
              <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList className="h-10">
                  <TabsTrigger value="rcdo" className="px-6">RCDO</TabsTrigger>
                  <TabsTrigger value="main" className="px-6">Meetings</TabsTrigger>
                  <TabsTrigger value="checkins" className="px-6">My DOSIs</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}
          
          {/* Right: Avatar positioned absolutely to avoid clipping */}
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
      </Tabs>

      {/* Mobile Bottom Navigation */}
      {isMobile && <MobileBottomNav />}
    </GridBackground>
  );
};

export default DashboardWithTabs;

