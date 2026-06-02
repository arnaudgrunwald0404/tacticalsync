import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { AppNavbar } from "@/components/ui/app-navbar";
import { ContentSkeleton } from "@/components/ui/content-skeleton";

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <AppNavbar />
      <Suspense fallback={<ContentSkeleton />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
