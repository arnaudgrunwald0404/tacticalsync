import { Suspense, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { AppNavbar } from "@/components/ui/app-navbar";
import { WeekendBanner } from "@/components/WeekendBanner";
import { ContentSkeleton } from "@/components/ui/content-skeleton";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { useSessionManager } from "@/hooks/useSessionManager";
import { AuthProvider, useCurrentUser } from "@/contexts/AuthContext";

export function AppLayout() {
  return (
    <AuthProvider>
      <AppLayoutInner />
    </AuthProvider>
  );
}

function AppLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useCurrentUser();

  useSessionManager();

  useEffect(() => {
    if (loading || user) return;

    // Build a returnTo param so the user lands back here after login
    const returnTo = location.pathname + location.search;
    const authUrl = returnTo && returnTo !== '/'
      ? `/auth?returnTo=${encodeURIComponent(returnTo)}`
      : '/auth';

    navigate(authUrl, { replace: true });
  }, [loading, user, navigate, location.pathname, location.search]);

  if (loading || !user) {
    return <PageSkeleton />;
  }

  const isChiefOfStaff = location.pathname.startsWith("/check-ins");

  const isInbox = location.pathname.startsWith("/inbox");

  // RCDO detail pages (DO/SI/all-hands) render their own independently-scrolling
  // sidebar tree + main content columns. That only works if this outer shell is
  // height-bounded — otherwise the whole page scrolls as one unit and the sidebar
  // and main content scroll together instead of separately.
  const isRCDODetail = location.pathname.startsWith("/rcdo/detail") || location.pathname.startsWith("/rcdo/all-hands");
  const useFullHeightShell = isInbox || isRCDODetail;

  return (
    <div className={useFullHeightShell ? "h-screen flex flex-col overflow-hidden" : "min-h-screen flex flex-col"}>
      <AppNavbar />
      {false && isChiefOfStaff && <WeekendBanner />}
      <Suspense fallback={<ContentSkeleton />}>
        {useFullHeightShell ? (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <Outlet />
          </div>
        ) : (
          <Outlet />
        )}
      </Suspense>
    </div>
  );
}
