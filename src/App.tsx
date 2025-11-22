import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { MeetingSkeleton } from "@/components/ui/meeting-skeleton";

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
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
// RCDO Module
const StrategyHome = lazy(() => import("./pages/StrategyHome"));
const DODetail = lazy(() => import("./pages/DODetail"));
const SIDetail = lazy(() => import("./pages/SIDetail"));
const TasksFeed = lazy(() => import("./pages/TasksFeed"));
const CyclePlanner = lazy(() => import("./pages/CyclePlanner"));
const StrategyCanvas = lazy(() => import("./pages/StrategyCanvas"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
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
          <Route path="/dashboard" element={
            <Suspense fallback={<DashboardSkeleton />}>
              <Dashboard />
            </Suspense>
          } />
          <Route path="/dashboard/main" element={
            <Suspense fallback={<DashboardSkeleton />}>
              <DashboardWithTabs />
            </Suspense>
          } />
          <Route path="/dashboard/rcdo" element={
            <Suspense fallback={<DashboardSkeleton />}>
              <DashboardWithTabs />
            </Suspense>
          } />
          <Route path="/dashboard/checkins" element={
            <Suspense fallback={<DashboardSkeleton />}>
              <DashboardWithTabs />
            </Suspense>
          } />
          <Route path="/dashboard/rcdo/do/:doId" element={
            <Suspense fallback={<PageSkeleton />}>
              <DODetail />
            </Suspense>
          } />
          <Route path="/dashboard/rcdo/si/:siId" element={
            <Suspense fallback={<PageSkeleton />}>
              <SIDetail />
            </Suspense>
          } />
          <Route path="/dashboard/rcdo/tasks-feed" element={
            <Suspense fallback={<PageSkeleton />}>
              <TasksFeed />
            </Suspense>
          } />
          <Route path="/dashboard/rcdo/cycles" element={
            <Suspense fallback={<PageSkeleton />}>
              <CyclePlanner />
            </Suspense>
          } />
          <Route path="/dashboard/rcdo/canvas" element={
            <Suspense fallback={<PageSkeleton />}>
              <StrategyCanvas />
            </Suspense>
          } />
          <Route path="/create-team" element={
            <Suspense fallback={<PageSkeleton />}>
              <CreateTeam />
            </Suspense>
          } />
          <Route path="/profile" element={
            <Suspense fallback={<PageSkeleton />}>
              <Profile />
            </Suspense>
          } />
          <Route path="/settings" element={
            <Suspense fallback={<PageSkeleton />}>
              <Settings />
            </Suspense>
          } />
          <Route path="/join/:inviteCode" element={
            <Suspense fallback={<PageSkeleton />}>
              <JoinTeam />
            </Suspense>
          } />
          <Route path="/team/:teamId/invite" element={
            <Suspense fallback={<PageSkeleton />}>
              <TeamInvite />
            </Suspense>
          } />
          <Route path="/team/:teamId/setup-meeting" element={
            <Suspense fallback={<PageSkeleton />}>
              <TeamMeetingSetup />
            </Suspense>
          } />
          <Route path="/team/:teamId/meeting/:meetingId" element={
            <Suspense fallback={<MeetingSkeleton />}>
              <TeamMeeting />
            </Suspense>
          } />
          <Route path="/team/:teamId/meeting/:meetingId/settings" element={
            <Suspense fallback={<PageSkeleton />}>
              <MeetingSettings />
            </Suspense>
          } />
          <Route path="/branding" element={
            <Suspense fallback={<PageSkeleton />}>
              <BrandingShowcase />
            </Suspense>
          } />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={
            <Suspense fallback={<PageSkeleton />}>
              <NotFound />
            </Suspense>
          } />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
