import { Suspense, useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AppNavbar } from "@/components/ui/app-navbar";
import { ContentSkeleton } from "@/components/ui/content-skeleton";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useSessionManager } from "@/hooks/useSessionManager";

export function AppLayout() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useSessionManager();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth", { replace: true });
      } else {
        setIsAuthenticated(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/auth", { replace: true });
      } else {
        setIsAuthenticated(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!isAuthenticated) {
    return <PageSkeleton />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppNavbar />
      <Suspense fallback={<ContentSkeleton />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
