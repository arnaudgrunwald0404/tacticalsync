import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Target, CheckSquare, RefreshCw, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import LayoutTextFlip from "@/components/ui/layout-text-flip";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();
  // True when OAuth redirected here with a PKCE code — show a spinner instead
  // of the hero page while Supabase exchanges the code for a session.
  const [handlingCallback] = useState(
    () => !!new URLSearchParams(window.location.search).get('code')
  );

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
          navigate("/chief-of-staff");
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
        navigate("/chief-of-staff");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (handlingCallback) {
    return (
      <GridBackground className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F5F3F0] via-white to-[#F8F6F2]">
        <div className="flex flex-col items-center gap-4">
          <Logo variant="full" size="xl" className="scale-90 sm:scale-100" />
          <div className="h-5 w-5 rounded-full border-2 border-[#4A5D5F] border-t-transparent animate-spin mt-2" />
        </div>
      </GridBackground>
    );
  }

  return (
    <GridBackground className="min-h-screen bg-gradient-to-br from-[#F5F3F0] via-white to-[#F8F6F2]">
      {/* Header - Hidden on mobile */}
      <header className="hidden sm:block border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Logo variant="minimal" size="lg" className="scale-100" />
          </div>
          <div className="flex gap-2">
          
            <Button 
                size="lg"
                className="font-body text-lg h-14 w-48 px-8 bg-[#4A5D5F] hover:bg-[#3A4D4F] text-white"
                onClick={() => navigate("/auth")}
              >
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="font-body text-lg h-14 w-48 px-8 border-2 border-[#4A5D5F] text-[#4A5D5F] hover:bg-[#4A5D5F]/10"
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
            <h2 className="sm:hidden font-heading text-3xl font-bold tracking-tight leading-tight text-[#2C2C2C]">
              Where Strategy Meets Accountability.
            </h2>

            {/* Desktop heading - with animation */}
            <h2 className="hidden sm:block font-heading text-4xl md:text-5xl font-bold tracking-tight leading-tight text-[#2C2C2C]">
              Great Teams Don't Just Meet —<br />They{" "}
              <LayoutTextFlip
                text=""
                words={["Own.", "Prepare.", "Follow Up.", "Delegate.", "Never Forget.", "Execute."]}
                duration={3000}
              />
            </h2>

            <div className="space-y-2 !mt-8 sm:!mt-12 md:!mt-16">
              <p className="hidden sm:block font-body text-sm tracking-widest uppercase text-[#B89A6B] font-semibold">
                Achieve Uncommon Execution.
              </p>
              <p className="font-body text-base sm:text-lg md:text-xl text-[#4A5D5F] max-w-2xl mx-auto px-4">
                Connect your strategy to daily execution — with built-in check-ins,
                commitments, and team alignment tools that actually close the loop.
              </p>
            </div>

            {/* Get Started button - Mobile only, placed after description */}
            <div className="sm:hidden pt-4">
              <Button 
                size="lg"
                className="font-body text-lg h-14 w-full max-w-sm px-8 bg-[#4A5D5F] hover:bg-[#3A4D4F] text-white"
                onClick={() => navigate("/auth")}
              >
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>


          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8 pt-8 sm:pt-12 md:pt-16">
            <div className="p-6 rounded-xl bg-white border border-[#6B9A8F]/30 hover:shadow-lg transition-all">
              <div className="rounded-full bg-[#4A5D5F]/10 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                <Target className="h-7 w-7 text-[#4A5D5F]" />
              </div>
              <h3 className="font-heading text-lg font-semibold mb-2 text-[#2C2C2C]">Strategy & Objectives</h3>
              <p className="font-body text-sm sm:text-base text-[#4A5D5F]">
                Set your Rallying Cry and Defining Objectives — the direction your whole team aligns around
              </p>
            </div>

            <div className="p-6 rounded-xl bg-white border border-[#6B9A8F]/30 hover:shadow-lg transition-all">
              <div className="rounded-full bg-[#4A5D5F]/10 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                <CheckSquare className="h-7 w-7 text-[#4A5D5F]" />
              </div>
              <h3 className="font-heading text-lg font-semibold mb-2 text-[#2C2C2C]">Commitments & Priorities</h3>
              <p className="font-body text-sm sm:text-base text-[#4A5D5F]">
                Track what each person owns, week to week — with clear priorities and accountability
              </p>
            </div>

            <div className="p-6 rounded-xl bg-white border border-[#6B9A8F]/30 hover:shadow-lg transition-all sm:col-span-2 md:col-span-1">
              <div className="rounded-full bg-[#4A5D5F]/10 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                <RefreshCw className="h-7 w-7 text-[#4A5D5F]" />
              </div>
              <h3 className="font-heading text-lg font-semibold mb-2 text-[#2C2C2C]">Check-ins & Progress</h3>
              <p className="font-body text-sm sm:text-base text-[#4A5D5F]">
                Close the loop with structured check-ins that connect daily work back to your strategy
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#6B9A8F]/20 mt-8 sm:mt-12 md:mt-20">
        <div className="container mx-auto px-4 py-6 text-center">
          <p className="font-body text-sm sm:text-base text-[#4A5D5F]">&copy; 2025 TacticalSync Inc. Built for uncommon execution.</p>
        </div>
      </footer>
    </GridBackground>
  );
};

export default Index;
