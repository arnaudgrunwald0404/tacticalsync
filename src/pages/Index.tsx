import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Target, Calendar, CheckSquare, ArrowRight } from "lucide-react";
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
          navigate("/workspace");
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
        navigate("/workspace");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <GridBackground className="min-h-screen bg-background">
      {/* Header - Hidden on mobile */}
      <header className="hidden sm:block border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Logo variant="minimal" size="lg" className="scale-100" />
          </div>
          <div className="flex gap-2">
            <Button
              size="lg"
              className="font-body text-lg h-14 w-48 px-8 bg-copper hover:bg-copper-hover text-white"
              onClick={() => navigate("/auth")}
            >
              Get Started
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="font-body text-lg h-14 w-48 px-8 border-2 border-titanium text-titanium hover:bg-titanium/10"
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
            <h2 className="sm:hidden font-heading text-3xl font-bold tracking-tight leading-tight text-cast-iron">
              Uncommon execution starts with uncommon alignment.
            </h2>

            {/* Desktop heading - with animation */}
            <h2 className="hidden sm:block font-heading text-4xl md:text-5xl font-bold tracking-tight leading-tight text-cast-iron">
              Uncommon Execution Starts <br />with{" "}
              <LayoutTextFlip
                text=""
                words={["Weekly", "Monthly", "Quarterly", "Daily"]}
                duration={3000}
              />
              {" "}Alignment
            </h2>

            <p className="font-body text-base sm:text-lg md:text-xl text-titanium max-w-2xl mx-auto px-4">
              Connect strategy to execution with collaborative meetings,
              defining objectives, and team accountability.
            </p>

            {/* Get Started button - Mobile only, placed after description */}
            <div className="sm:hidden pt-4">
              <Button
                size="lg"
                className="font-body text-lg h-14 w-full max-w-sm px-8 bg-copper hover:bg-copper-hover text-white"
                onClick={() => navigate("/auth")}
              >
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8 pt-8 sm:pt-12 md:pt-16">
            <div className="p-6 rounded-xl bg-white border border-rose-gold/30 hover:shadow-lg transition-all">
              <div className="rounded-full bg-copper/10 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                <Target className="h-7 w-7 text-copper" />
              </div>
              <h3 className="font-heading text-lg font-semibold mb-2 text-cast-iron">Strategic Alignment</h3>
              <p className="font-body text-sm sm:text-base text-titanium">
                Cascade rallying cries into defining objectives and track progress across your team
              </p>
            </div>

            <div className="p-6 rounded-xl bg-white border border-rose-gold/30 hover:shadow-lg transition-all">
              <div className="rounded-full bg-copper/10 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-7 w-7 text-copper" />
              </div>
              <h3 className="font-heading text-lg font-semibold mb-2 text-cast-iron">Consistent Cadence</h3>
              <p className="font-body text-sm sm:text-base text-titanium">
                Run structured meetings weekly and track accountability over time
              </p>
            </div>

            <div className="p-6 rounded-xl bg-white border border-rose-gold/30 hover:shadow-lg transition-all sm:col-span-2 md:col-span-1">
              <div className="rounded-full bg-copper/10 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                <CheckSquare className="h-7 w-7 text-copper" />
              </div>
              <h3 className="font-heading text-lg font-semibold mb-2 text-cast-iron">Uncommon Execution</h3>
              <p className="font-body text-sm sm:text-base text-titanium">
                Turn strategy into action items, assign owners, and drive completion
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-rose-gold/20 mt-8 sm:mt-12 md:mt-20">
        <div className="container mx-auto px-4 py-6 text-center">
          <p className="font-body text-sm sm:text-base text-titanium">&copy; 2025 TacticalSync Inc. Built for uncommon execution.</p>
        </div>
      </footer>
    </GridBackground>
  );
};

export default Index;
