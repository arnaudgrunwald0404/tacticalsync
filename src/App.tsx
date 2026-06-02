import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { RoleOverrideProvider } from "@/contexts/RoleOverrideContext";
import { RoleOverrideBanner } from "@/components/ui/role-override-banner";
import { MeetingSkeleton } from "@/components/ui/meeting-skeleton";
import { AppLayout } from "@/components/AppLayout";

// Lazy load all page components for code splitting
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DashboardWithTabs = lazy(() => import("./pages/DashboardWithTabs"));
const DashboardMain = lazy(() => import("./pages/DashboardMain"));
const CreateTeam = lazy(() => import("./pages/CreateTeam"));
const TeamMeeting = lazy(() => import("./pages/TeamMeeting"));
const TeamInvite = lazy(() => import("./pages/TeamInvite"));
const TeamMeetingSetup = lazy(() => import("./pages/TeamMeetingSetup"));
const MeetingSettings = lazy(() => import("./pages/MeetingSettings"));
const JoinTeam = lazy(() => import("./pages/JoinTeam"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const BrandingShowcase = lazy(() => import("./pages/BrandingShowcase"));
const ColorPaletteShowcase = lazy(() => import("./pages/ColorPaletteShowcase"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
// Chief of Staff
const ChiefOfStaff = lazy(() => import("./pages/ChiefOfStaff"));
// RCDO Module
const StrategyHome = lazy(() => import("./pages/StrategyHome"));
const DODetail = lazy(() => import("./pages/DODetail"));
const SIDetail = lazy(() => import("./pages/SIDetail"));
const TasksFeed = lazy(() => import("./pages/TasksFeed"));
const StrategyCanvas = lazy(() => import("./pages/StrategyCanvas"));
const RCDOAllHands = lazy(() => import("./pages/RCDOAllHands"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <RoleOverrideProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <RoleOverrideBanner />
      <BrowserRouter>
        <Routes>
          {/* Public routes — no shared navbar */}
          <Route path="/" element={
            <Suspense fallback={<PageSkeleton />}>
              <Index />
            </Suspense>
          } />
          <Route path="/auth" element={
            <Suspense fallback={<PageSkeleton />}>
              <Auth />
            </Suspense>
          } />
          <Route path="/reset-password" element={
            <Suspense fallback={<PageSkeleton />}>
              <ResetPassword />
            </Suspense>
          } />
          <Route path="/join/:inviteCode" element={
            <Suspense fallback={<PageSkeleton />}>
              <JoinTeam />
            </Suspense>
          } />
          {/* Meeting page — has its own specialized header */}
          <Route path="/team/:teamId/meeting/:meetingId" element={
            <Suspense fallback={<MeetingSkeleton />}>
              <TeamMeeting />
            </Suspense>
          } />

          {/* Authenticated routes — AppLayout renders the persistent navbar */}
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/my-meetings" element={<DashboardWithTabs />} />
            <Route path="/dashboard/rcdo" element={<DashboardWithTabs />} />
            <Route path="/commitments" element={<DashboardWithTabs />} />
            <Route path="/insights" element={<DashboardWithTabs />} />
            <Route path="/chief-of-staff" element={<DashboardWithTabs />} />
            <Route path="/rcdo/detail/do/:doId" element={<DODetail />} />
            <Route path="/rcdo/detail/si/:siId" element={<SIDetail />} />
            <Route path="/dashboard/rcdo/tasks-feed" element={<TasksFeed />} />
            <Route path="/rcdo/canvas" element={<StrategyCanvas />} />
            <Route path="/rcdo/all-hands" element={<RCDOAllHands />} />
            <Route path="/dashboard/rcdo/canvas" element={<StrategyCanvas />} />
            <Route path="/create-team" element={<CreateTeam />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/team/:teamId/invite" element={<TeamInvite />} />
            <Route path="/team/:teamId/setup-meeting" element={<TeamMeetingSetup />} />
            <Route path="/team/:teamId/meeting/:meetingId/settings" element={<MeetingSettings />} />
            <Route path="/branding" element={<BrandingShowcase />} />
            <Route path="/color-palette" element={<ColorPaletteShowcase />} />
          </Route>

          {/* Legacy redirects */}
          <Route path="/dashboard/main" element={<Navigate to="/my-meetings" replace />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={
            <Suspense fallback={<PageSkeleton />}>
              <NotFound />
            </Suspense>
          } />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </RoleOverrideProvider>
  </QueryClientProvider>
);

export default App;
