import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Users, Calendar, CheckSquare, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import LayoutTextFlip from "@/components/ui/layout-text-flip";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();

  // Check for existing session or OAuth callback
  useEffect(() => {
    // Check if there's a code parameter (PKCE/OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const hasCode = !!code;

    // If there's a code parameter, wait for auth state change to handle it
    // Otherwise, check existing session immediately
    if (!hasCode) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          navigate("/dashboard");
        }
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Handle PKCE callback - code exchange happens automatically with detectSessionInUrl: true
      if (session) {
        // Clean up URL by removing code parameter after successful auth
        if (hasCode) {
          window.history.replaceState({}, '', window.location.pathname);
        }
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <GridBackground className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      {/* Header - Hidden on mobile */}
      <header className="hidden sm:block border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Logo variant="minimal" size="lg" className="scale-100" />
          </div>
          <div className="flex gap-2">
          
            <Button 
              size="lg"
              className="text-lg h-14 w-48 px-8"
              onClick={() => navigate("/auth")}
            >
              Get Started
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="text-lg h-14 w-48 px-8 border-2 border-gray-300"
              onClick={() => navigate("/auth")}
            >
              Sign In
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 sm:py-12 md:py-20">
        <div className="max-w-4xl mx-auto text-center space-y-6 sm:space-y-8">
          {/* Large centered logo - Mobile only */}
          <div className="sm:hidden flex justify-center mb-8">
            <Logo variant="full" size="lg" className="scale-125" />
          </div>

          <div className="space-y-4 sm:space-y-8">
            {/* Mobile heading - simple text */}
            <h2 className="sm:hidden text-3xl font-bold tracking-tight leading-tight">
              Great leadership starts with great team meetings.
            </h2>

            {/* Desktop heading - with animation */}
            <h2 className="hidden sm:block text-4xl md:text-5xl font-bold tracking-tight leading-tight">
               Great Leadership Starts <br></br>with Great {" "}
              
                <LayoutTextFlip 
                  text=""
                  words={["Weekly", "Monthly", "Quarterly", "Daily"]}
                  duration={3000}
                />
              {" "}
              Team Meetings
            </h2>

            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
              Streamline your tactical meetings with collaborative agenda tracking,
              action items, and team accountability.
            </p>

            {/* Get Started button - Mobile only, placed after description */}
            <div className="sm:hidden pt-4">
              <Button 
                size="lg"
                className="text-lg h-14 w-full max-w-sm px-8"
                onClick={() => navigate("/auth")}
              >
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>


          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8 pt-8 sm:pt-12 md:pt-16">
            <div className="p-6 rounded-lg bg-card border border-pink-200 hover:shadow-large transition-all">
              <div className="rounded-full bg-pink-100 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-pink-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Team Collaboration</h3>
              <p className="text-sm sm:text-base text-muted-foreground">
                Invite team members and collaborate in real-time on meeting agendas and topics
              </p>
            </div>

            <div className="p-6 rounded-lg bg-card border border-pink-200 hover:shadow-large transition-all">
              <div className="rounded-full bg-pink-100 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-7 w-7 text-pink-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Consistent Tracking</h3>
              <p className="text-sm sm:text-base text-muted-foreground">
                Automatically organize meetings by week and track progress over time
              </p>
            </div>

            <div className="p-6 rounded-lg bg-card border border-pink-200 hover:shadow-large transition-all sm:col-span-2 md:col-span-1">
              <div className="rounded-full bg-pink-100 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                <CheckSquare className="h-7 w-7 text-pink-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Action Items</h3>
              <p className="text-sm sm:text-base text-muted-foreground">
                Assign tasks, set time estimates, and track completion with ease
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t mt-8 sm:mt-12 md:mt-20">
        <div className="container mx-auto px-4 py-6 text-center text-muted-foreground">
          <p className="text-sm sm:text-base">&copy; 2025 TacticalSync Inc. Built for uncommon execution.</p>
        </div>
      </footer>
    </GridBackground>
  );
};

export default Index;
