import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import CreateTeam from "./pages/CreateTeam";
import TeamMeeting from "./pages/TeamMeeting";
import TeamSettings from "./pages/TeamSettings";
import TeamInvite from "./pages/TeamInvite";
import JoinTeam from "./pages/JoinTeam";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/create-team" element={<CreateTeam />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/join/:inviteCode" element={<JoinTeam />} />
          <Route path="/team/:teamId/invite" element={<TeamInvite />} />
          <Route path="/team/:teamId" element={<TeamMeeting />} />
          <Route path="/team/:teamId/settings" element={<TeamSettings />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
