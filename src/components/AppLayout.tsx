import { Suspense, useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { AppNavbar } from "@/components/ui/app-navbar";
import { WeekendBanner } from "@/components/WeekendBanner";
import { ContentSkeleton } from "@/components/ui/content-skeleton";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useSessionManager } from "@/hooks/useSessionManager";

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useSessionManager();

  useEffect(() => {
    // Build a returnTo param so the user lands back here after login
    const returnTo = location.pathname + location.search;
    const authUrl = returnTo && returnTo !== '/'
      ? `/auth?returnTo=${encodeURIComponent(returnTo)}`
      : '/auth';

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate(authUrl, { replace: true });
      } else {
        setIsAuthenticated(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate(authUrl, { replace: true });
      } else {
        setIsAuthenticated(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, location.pathname, location.search]);

  if (!isAuthenticated) {
    return <PageSkeleton />;
  }

  const isChiefOfStaff = location.pathname.startsWith("/check-ins");

  const isInbox = location.pathname.startsWith("/inbox");

  return (
    <div className={isInbox ? "h-screen flex flex-col overflow-hidden" : "min-h-screen flex flex-col"}>
      <AppNavbar />
      {isChiefOfStaff && <WeekendBanner />}
      <Suspense fallback={<ContentSkeleton />}>
        {isInbox ? (
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
