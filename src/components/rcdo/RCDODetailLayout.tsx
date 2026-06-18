import { Outlet, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Menu } from 'lucide-react';
import GridBackground from '@/components/ui/grid-background';
import { DetailPageNavigation } from './DetailPageNavigation';
import { CycleSelector } from './CycleSelector';
import { useRCDODetail } from '@/contexts/RCDODetailContext';

export function RCDODetailLayout() {
  const navigate = useNavigate();
  const { navState, setNavState } = useRCDODetail();
  const { rallyingCryId, cycleId, currentDOId, currentSIId, currentTaskId, mobileNavOpen } = navState;

  const setMobileNavOpen = (open: boolean) => setNavState({ mobileNavOpen: open });

  return (
    <GridBackground inverted className="flex flex-col min-h-screen bg-gradient-to-br from-[#F5F3F0] via-white to-[#F8F6F2] overscroll-none">
      {/* Mobile Navigation Menu Button */}
      {rallyingCryId && (
        <div className="md:hidden px-4 py-2 border-b bg-white">
          <Button
            variant="outline"
            size="sm"
            className="h-10 w-10 p-0"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
        <Button
          onClick={() => navigate(cycleId ? `/rcdo/canvas?cycle=${cycleId}` : '/dashboard/rcdo?list=true')}
          className="flex items-center gap-1.5 text-xs text-white hover:text-white/80 transition-colors"
        >
          <LayoutGrid className="h-4 w-4 mr-2" />
          Go to Canvas View
        </Button>
        <CycleSelector currentCycleId={cycleId} />
      </div>
      <div className="flex-1 flex overflow-hidden">
        {rallyingCryId && (
          <>
            {/* Desktop sidebar — persists across all RCDO detail navigations */}
            <div className="hidden md:flex flex-col h-full">
              <DetailPageNavigation
                rallyingCryId={rallyingCryId}
                cycleId={cycleId}
                currentDOId={currentDOId}
                currentSIId={currentSIId}
                currentTaskId={currentTaskId}
              />
            </div>
            {/* Mobile sidebar */}
            <div className="md:hidden">
              <DetailPageNavigation
                rallyingCryId={rallyingCryId}
                cycleId={cycleId}
                currentDOId={currentDOId}
                currentSIId={currentSIId}
                currentTaskId={currentTaskId}
                mobileOpen={mobileNavOpen}
                onMobileOpenChange={setMobileNavOpen}
              />
            </div>
          </>
        )}
        <div className="container mx-auto px-4 py-4 max-w-7xl flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </GridBackground>
  );
}
