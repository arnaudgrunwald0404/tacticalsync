import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Menu } from 'lucide-react';
import GridBackground from '@/components/ui/grid-background';
import { UserProfileHeader } from '@/components/ui/user-profile-header';
import Logo from '@/components/Logo';
import { DetailPageNavigation } from './DetailPageNavigation';

interface DetailPageLayoutProps {
  rallyingCryId: string;
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
      <header className="sticky top-0 z-50 border-b bg-white flex-shrink-0">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between relative pr-20">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard/rcdo')}
              className="h-10 w-10 p-0 sm:h-auto sm:w-auto sm:px-3"
            >
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            {/* Mobile Navigation Menu Button */}
            {!loading && rallyingCryId && (
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-10 p-0 md:hidden"
                onClick={() => onMobileNavOpenChange(true)}
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100" />
          </div>
          <UserProfileHeader />
        </div>
      </header>
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar - Hidden on mobile, shown via Sheet */}
        {!loading && rallyingCryId && (
          <>
            <div className="hidden md:flex flex-col h-full">
              <DetailPageNavigation
                rallyingCryId={rallyingCryId}
                currentDOId={currentDOId}
                currentSIId={currentSIId}
                currentTaskId={currentTaskId}
              />
            </div>
            {/* Mobile Navigation Sidebar */}
            <div className="md:hidden">
              <DetailPageNavigation
                rallyingCryId={rallyingCryId}
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

