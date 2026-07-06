import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { Target, CheckSquare, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import Logo from "@/components/Logo";
import LayoutTextFlip from "@/components/ui/layout-text-flip";

/** QA-only escape hatch: real accounts, real Supabase auth, just a second sign-in
 *  path so QA doesn't need a Google account. Gated on hostname, not build mode,
 *  so it stays off even in a production build served from a non-local host. */
const isLocalhost = () =>
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

const Auth = () => {
  const navigate = useNavigate();
  const [qaEmail, setQaEmail] = useState("");
  const [qaPassword, setQaPassword] = useState("");
  const [qaSubmitting, setQaSubmitting] = useState(false);

  const resolvePostLoginPath = (): string => {
    const storedInvite = localStorage.getItem('pendingInviteCode');
    if (storedInvite) {
      localStorage.removeItem('pendingInviteCode');
      return `/join/${storedInvite}`;
    }
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    if (inviteCode) return `/join/${inviteCode}`;
    const storedReturnTo = localStorage.getItem('pendingReturnTo');
    if (storedReturnTo) {
      localStorage.removeItem('pendingReturnTo');
      return storedReturnTo;
    }
    const returnTo = params.get('returnTo');
    if (returnTo) return returnTo;
    return '/chief-of-staff';
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const hasCode = !!code;
    const hash = window.location.hash;
    const hasAccessToken = hash.includes('access_token=');

    if (!hasCode && !hasAccessToken) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) navigate(resolvePostLoginPath());
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password');
        return;
      }

      if (session) {
        if (hasCode || hasAccessToken) {
          const currentParams = new URLSearchParams(window.location.search);
          const currentInviteCode = currentParams.get('invite');
          const currentReturnTo = currentParams.get('returnTo');
          const preservedParams = new URLSearchParams();
          if (currentInviteCode) preservedParams.set('invite', currentInviteCode);
          if (currentReturnTo) preservedParams.set('returnTo', currentReturnTo);
          const qs = preservedParams.toString();
          window.history.replaceState({}, '', qs ? `/auth?${qs}` : '/auth');
        }
        navigate(resolvePostLoginPath());
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    if (inviteCode) localStorage.setItem('pendingInviteCode', inviteCode);
    const returnTo = params.get('returnTo');
    if (returnTo) localStorage.setItem('pendingReturnTo', returnTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth`,
      },
    });

    if (error) {
      console.error("Error signing in:", error.message);
      toast.error("Failed to sign in with Google");
    }
  };

  const handleQaPasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    // Redundant with the render guard below, but a form handler that reaches
    // the network is worth guarding directly rather than trusting only the UI.
    if (!isLocalhost()) return;

    setQaSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: qaEmail,
      password: qaPassword,
    });
    setQaSubmitting(false);

    if (error) {
      toast.error(error.message || "Failed to sign in");
    }
    // On success, the onAuthStateChange listener above handles navigation.
  };

  return (
    <div className="h-screen flex flex-col lg:flex-row overscroll-none overflow-hidden">
      {/* Left branding panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] bg-[#4A5D5F] relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }} />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          <div>
            <Logo variant="minimal" size="lg" theme="dark" />
          </div>

          <div className="space-y-10">
            <div className="space-y-4">
              <h1 className="font-heading text-3xl xl:text-4xl font-bold text-white leading-tight">
                Great Teams Don't<br />Just Meet —<br />
                <span className="text-white/90">They </span>
                <LayoutTextFlip
                  text=""
                  words={["Own.", "Prepare.", "Follow Up.", "Delegate.", "Execute."]}
                  duration={3000}
                />
              </h1>
              <p className="font-body text-white/40 text-sm tracking-widest uppercase font-medium">
                Achieve Uncommon Execution
              </p>
            </div>

            <div className="space-y-5">
              {[
                { icon: Target, label: "Strategy & Objectives", desc: "Cascade your rallying cry into measurable goals" },
                { icon: CheckSquare, label: "Commitments & Priorities", desc: "Track ownership and follow-through every week" },
                { icon: RefreshCw, label: "Check-ins & Progress", desc: "Run structured reviews that close the loop" },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-4">
                  <div className="rounded-lg bg-white/10 p-2.5 flex-shrink-0">
                    <Icon className="h-5 w-5 text-white/70" />
                  </div>
                  <div>
                    <p className="font-heading text-sm font-semibold text-white">{label}</p>
                    <p className="font-body text-sm text-white/50">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="font-body text-xs text-white/30">
            &copy; 2026 TacticalSync Inc.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center bg-white px-5 sm:px-8 py-10 sm:py-12 overflow-y-auto">
        <div className="w-full max-w-[420px] space-y-8">
          <div className="lg:hidden flex justify-center">
            <Logo variant="full" size="xl" className="scale-90 sm:scale-100" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="text-center space-y-2">
              <h2 className="font-heading text-2xl sm:text-3xl font-bold text-cast-iron">
                Welcome
              </h2>
              <p className="font-body text-base text-titanium">
                Sign in to continue to TacticalSync
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              className="font-body w-full h-12 text-base font-normal bg-[#4A5D5F] text-white border-[#4A5D5F] hover:bg-[#3d4f51] hover:border-[#3d4f51] shadow-sm hover:shadow-md transition-all"
              onClick={handleGoogleSignIn}
            >
              Sign in with Google
            </Button>

            {isLocalhost() && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                    QA only · localhost
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <form onSubmit={handleQaPasswordSignIn} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="qa-email" className="text-xs text-titanium">Email</Label>
                    <Input
                      id="qa-email"
                      type="email"
                      autoComplete="username"
                      value={qaEmail}
                      onChange={e => setQaEmail(e.target.value)}
                      placeholder="qa@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="qa-password" className="text-xs text-titanium">Password</Label>
                    <Input
                      id="qa-password"
                      type="password"
                      autoComplete="current-password"
                      value={qaPassword}
                      onChange={e => setQaPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    className="font-body w-full h-11 text-sm font-normal"
                    disabled={qaSubmitting}
                  >
                    {qaSubmitting ? "Signing in…" : "Sign in with password"}
                  </Button>
                </form>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
