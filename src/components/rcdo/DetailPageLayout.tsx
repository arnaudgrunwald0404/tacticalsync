import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Menu } from 'lucide-react';
import GridBackground from '@/components/ui/grid-background';
import { AppNavbar } from '@/components/ui/app-navbar';
import { DetailPageNavigation } from './DetailPageNavigation';
import { CycleSelector } from './CycleSelector';

interface DetailPageLayoutProps {
  rallyingCryId: string;
  cycleId?: string;
  currentDOId?: string;
  currentSIId?: string;
  currentTaskId?: string;
  mobileNavOpen: boolean;
  onMobileNavOpenChange: (open: boolean) => void;
  children: ReactNode;
  loading?: boolean;
}

export function DetailPageLayout({
  rallyingCryId,
  cycleId,
  currentDOId,
  currentSIId,
  currentTaskId,
  mobileNavOpen,
  onMobileNavOpenChange,
  children,
  loading = false,
}: DetailPageLayoutProps) {
  const navigate = useNavigate();

  return (
    <GridBackground inverted className="flex flex-col min-h-screen bg-gradient-to-br from-[#F5F3F0] via-white to-[#F8F6F2] overscroll-none">
      <AppNavbar />
      {/* Mobile Navigation Menu Button */}
      {!loading && rallyingCryId && (
        <div className="md:hidden px-4 py-2 border-b bg-white">
          <Button
            variant="outline"
            size="sm"
            className="h-10 w-10 p-0"
            onClick={() => onMobileNavOpenChange(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
        <Button
          onClick={() => navigate(cycleId ? `/rcdo/canvas?cycle=${cycleId}` : '/dashboard/rcdo')}
          className="flex items-center gap-1.5 text-xs text-white hover:text-white/80 transition-colors"
        >
          <LayoutGrid className="h-4 w-4 mr-2" />
          Go to Canvas View
        </Button>
        <CycleSelector currentCycleId={cycleId} />
      </div>
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar - Hidden on mobile, shown via Sheet */}
        {!loading && rallyingCryId && (
          <>
            <div className="hidden md:flex flex-col h-full">
              <DetailPageNavigation
                rallyingCryId={rallyingCryId}
                cycleId={cycleId}
                currentDOId={currentDOId}
                currentSIId={currentSIId}
                currentTaskId={currentTaskId}
              />
            </div>
            {/* Mobile Navigation Sidebar */}
            <div className="md:hidden">
              <DetailPageNavigation
                rallyingCryId={rallyingCryId}
                cycleId={cycleId}
                currentDOId={currentDOId}
                currentSIId={currentSIId}
                currentTaskId={currentTaskId}
                mobileOpen={mobileNavOpen}
                onMobileOpenChange={onMobileNavOpenChange}
              />
            </div>
          </>
        )}
        {/* Main Content */}
        <div className="container mx-auto px-4 py-4 max-w-7xl flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </GridBackground>
  );
}

