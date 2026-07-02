import { Suspense } from "react";
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
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { RCDODetailProvider } from "@/contexts/RCDODetailContext";
import { RCDODetailLayout } from "@/components/rcdo/RCDODetailLayout";

// Lazy load all page components for code splitting
const Index = lazyWithRetry(() => import("./pages/Index"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const DashboardWithTabs = lazyWithRetry(() => import("./pages/DashboardWithTabs"));
const DashboardMain = lazyWithRetry(() => import("./pages/DashboardMain"));
const CreateTeam = lazyWithRetry(() => import("./pages/CreateTeam"));
const TeamMeeting = lazyWithRetry(() => import("./pages/TeamMeeting"));
const TeamInvite = lazyWithRetry(() => import("./pages/TeamInvite"));
const TeamMeetingSetup = lazyWithRetry(() => import("./pages/TeamMeetingSetup"));
const MeetingSettings = lazyWithRetry(() => import("./pages/MeetingSettings"));
const JoinTeam = lazyWithRetry(() => import("./pages/JoinTeam"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));
const BrandingShowcase = lazyWithRetry(() => import("./pages/BrandingShowcase"));
const ColorPaletteShowcase = lazyWithRetry(() => import("./pages/ColorPaletteShowcase"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
// Chief of Staff
const ChiefOfStaff = lazyWithRetry(() => import("./pages/ChiefOfStaff"));
// Inbox (experimental parallel build)
const InboxPage = lazyWithRetry(() => import("./pages/Inbox"));
// RCDO Module
const StrategyHome = lazyWithRetry(() => import("./pages/StrategyHome"));
const DODetail = lazyWithRetry(() => import("./pages/DODetail"));
const SIDetail = lazyWithRetry(() => import("./pages/SIDetail"));
const TasksFeed = lazyWithRetry(() => import("./pages/TasksFeed"));
const StrategyCanvas = lazyWithRetry(() => import("./pages/StrategyCanvas"));
const RCDOAllHands = lazyWithRetry(() => import("./pages/RCDOAllHands"));

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
            <Route path="/chief-of-staff/*" element={<DashboardWithTabs />} />
            <Route path="/inbox" element={
              <Suspense fallback={<PageSkeleton />}>
                <InboxPage />
              </Suspense>
            } />
            <Route element={<RCDODetailProvider><RCDODetailLayout /></RCDODetailProvider>}>
              <Route path="/rcdo/detail/do/:doId" element={<DODetail />} />
              <Route path="/rcdo/detail/si/:siId" element={<SIDetail />} />
              <Route path="/rcdo/all-hands" element={<RCDOAllHands />} />
            </Route>
            <Route path="/dashboard/rcdo/tasks-feed" element={<TasksFeed />} />
            <Route path="/rcdo/canvas" element={<StrategyCanvas />} />
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
