import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, ArrowLeft, Target, CheckSquare, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import Logo from "@/components/Logo";
import LayoutTextFlip from "@/components/ui/layout-text-flip";

const Auth = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showVerificationBanner, setShowVerificationBanner] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [activeTab, setActiveTab] = useState("signin");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    const code = params.get('code');
    const hasCode = !!code;
    const hash = window.location.hash;
    const hasAccessToken = hash.includes('access_token=');

    if (hasCode || hasAccessToken) {
      console.log('[Auth] OAuth callback detected, waiting for Supabase to process...');
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          if (inviteCode) {
            navigate(`/join/${inviteCode}`);
          } else {
            navigate("/chief-of-staff");
          }
        }
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth] Auth state changed:', event, 'Has session:', !!session);

      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password');
        return;
      }

      if (session) {
        if (hasCode || hasAccessToken) {
          const currentParams = new URLSearchParams(window.location.search);
          const currentInviteCode = currentParams.get('invite');
          const newUrl = currentInviteCode ? `/auth?invite=${currentInviteCode}` : '/auth';
          window.history.replaceState({}, '', newUrl);
        }

        const storedInvite = localStorage.getItem('pendingInviteCode');
        if (storedInvite) {
          localStorage.removeItem('pendingInviteCode');
          navigate(`/join/${storedInvite}`);
        } else if (inviteCode) {
          navigate(`/join/${inviteCode}`);
        } else {
          navigate("/chief-of-staff");
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('[Auth] User signed out');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    if (inviteCode) {
      localStorage.setItem('pendingInviteCode', inviteCode);
    }

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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      toast.error("Please enter your email address");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset email sent! Check your inbox.");

      try {
        const isAppLocal = window.location.hostname === 'localhost' ||
                          window.location.hostname === '127.0.0.1' ||
                          window.location.hostname.includes('localhost');
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const isSupabaseLocal = supabaseUrl && (supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1'));

        if (isAppLocal && isSupabaseLocal) {
          const url = new URL(supabaseUrl);
          const emailServiceUrl = `${url.protocol}//${url.hostname}:54324/emails`;

          const tryFetchEmail = async (attempt: number, delay: number) => {
            await new Promise(resolve => setTimeout(resolve, delay));
            try {
              const response = await fetch(emailServiceUrl);
              if (!response.ok) {
                if (attempt < 5) tryFetchEmail(attempt + 1, delay * 1.5);
                return;
              }
              const emails = await response.json();
              if (!emails || !Array.isArray(emails)) return;

              const userEmails = emails.filter((email: { to?: string; recipient?: string; subject?: string }) => {
                const emailTo = (email.to?.toLowerCase() || email.recipient?.toLowerCase() || '');
                const subject = (email.subject?.toLowerCase() || '');
                return emailTo === trimmedEmail.toLowerCase() &&
                       (subject.includes('reset') || subject.includes('password'));
              });

              if (userEmails.length === 0) {
                if (attempt < 5) tryFetchEmail(attempt + 1, delay * 1.5);
                return;
              }

              const userEmail = userEmails.sort((a: { created_at?: string; createdAt?: string }, b: { created_at?: string; createdAt?: string }) => {
                const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
                const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
                return dateB - dateA;
              })[0];

              const htmlContent = userEmail.html || userEmail.text || userEmail.body || '';
              const patterns = [
                /href=["']([^"']*reset[^"']*token=[^"']*)["']/i,
                /href=["']([^"']*password[^"']*token=[^"']*)["']/i,
                /href=["']([^"']*\/auth\/v1\/.*recover[^"']*)["']/i,
                /(https?:\/\/[^\s<>"']*reset[^\s<>"']*token=[^\s<>"']*)/i,
                /(https?:\/\/[^\s<>"']*\/auth\/v1\/.*recover[^\s<>"']*)/i,
              ];

              let resetLink: string | null = null;
              for (const pattern of patterns) {
                const match = htmlContent.match(pattern);
                if (match && match[1]) {
                  resetLink = match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
                  break;
                }
              }

              if (resetLink) {
                console.log('%c🔗 PASSWORD RESET LINK:', 'background: #4CAF50; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 14px;');
                console.log('%c' + resetLink, 'color: #2196F3; font-size: 12px;');
              }
            } catch (emailErr) {
              if (attempt < 5) tryFetchEmail(attempt + 1, delay * 1.5);
            }
          };
          tryFetchEmail(1, 500);
        }
      } catch (err) {
        console.log('[DEBUG] Error setting up password reset email fetch:', err instanceof Error ? err.message : err);
      }

      setIsForgotPassword(false);
      setEmail("");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      toast.error("Please enter email and password");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (error) throw error;

        if (data.user && !data.session) {
          try {
            const isAppLocal = window.location.hostname === 'localhost' ||
                              window.location.hostname === '127.0.0.1' ||
                              window.location.hostname.includes('localhost');
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const isSupabaseLocal = supabaseUrl && (supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1'));

            if (isAppLocal && isSupabaseLocal) {
              const url = new URL(supabaseUrl);
              const emailServiceUrl = `${url.protocol}//${url.hostname}:54324/emails`;

              const tryFetchEmail = async (attempt: number, delay: number) => {
                await new Promise(resolve => setTimeout(resolve, delay));
                try {
                  const response = await fetch(emailServiceUrl);
                  if (!response.ok) {
                    if (attempt < 5) tryFetchEmail(attempt + 1, delay * 1.5);
                    return;
                  }
                  const emails = await response.json();
                  if (!emails || !Array.isArray(emails)) return;

                  const userEmails = emails.filter((email: { to?: string; recipient?: string }) => {
                    const emailTo = email.to?.toLowerCase() || email.recipient?.toLowerCase() || '';
                    return emailTo === trimmedEmail.toLowerCase();
                  });

                  if (userEmails.length === 0) {
                    if (attempt < 5) tryFetchEmail(attempt + 1, delay * 1.5);
                    return;
                  }

                  const userEmail = userEmails.sort((a: { created_at?: string; createdAt?: string }, b: { created_at?: string; createdAt?: string }) => {
                    const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
                    const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
                    return dateB - dateA;
                  })[0];

                  const htmlContent = userEmail.html || userEmail.text || userEmail.body || '';
                  const patterns = [
                    /href=["']([^"']*confirmation[^"']*token=[^"']*)["']/i,
                    /href=["']([^"']*verify[^"']*token=[^"']*)["']/i,
                    /href=["']([^"']*\/auth\/v1\/verify[^"']*)["']/i,
                    /(https?:\/\/[^\s<>"']*confirmation[^\s<>"']*token=[^\s<>"']*)/i,
                    /(https?:\/\/[^\s<>"']*verify[^\s<>"']*token=[^\s<>"']*)/i,
                  ];

                  let verificationLink: string | null = null;
                  for (const pattern of patterns) {
                    const match = htmlContent.match(pattern);
                    if (match && match[1]) {
                      verificationLink = match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
                      break;
                    }
                  }

                  if (verificationLink) {
                    console.log('%c🔗 VERIFICATION LINK:', 'background: #4CAF50; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 14px;');
                    console.log('%c' + verificationLink, 'color: #2196F3; font-size: 12px;');
                  }
                } catch (emailErr) {
                  if (attempt < 5) tryFetchEmail(attempt + 1, delay * 1.5);
                }
              };
              tryFetchEmail(1, 500);
            } else {
              // Production: use Edge Function
              try {
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                const response = await fetch(`${supabaseUrl}/functions/v1/get-verification-link`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                  },
                  body: JSON.stringify({
                    userId: data.user.id,
                    email: trimmedEmail,
                    type: 'signup',
                    redirectTo: `${window.location.origin}/dashboard`
                  }),
                });
                const responseData = await response.json();
                if (response.ok && responseData?.link) {
                  console.log('%c🔗 VERIFICATION LINK:', 'background: #4CAF50; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
                  console.log('%c' + responseData.link, 'color: #2196F3; font-size: 12px;');
                }
              } catch (err) {
                console.log('[DEBUG] Error calling get-verification-link function:', err instanceof Error ? err.message : err);
              }
            }
          } catch (err) {
            console.log('[DEBUG] Error setting up email fetch:', err instanceof Error ? err.message : err);
          }
        }

        const session = data.session;
        if (session) {
          toast.success("Account created successfully!");
          const params = new URLSearchParams(window.location.search);
          const inviteCode = params.get('invite');
          const storedInvite = localStorage.getItem('pendingInviteCode');

          if (storedInvite) {
            localStorage.removeItem('pendingInviteCode');
            navigate(`/join/${storedInvite}`);
          } else if (inviteCode) {
            navigate(`/join/${inviteCode}`);
          } else {
            navigate("/chief-of-staff");
          }
        } else {
          setVerificationEmail(trimmedEmail);
          setShowVerificationBanner(true);
          setPassword("");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;
        toast.success("Signed in successfully!");
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───
  return (
    <div className="h-screen flex flex-col lg:flex-row overscroll-none overflow-hidden">
      {/* ── Left branding panel (hidden on mobile) ── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] bg-[#4A5D5F] relative overflow-hidden">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }} />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Top: logo */}
          <div>
            <Logo variant="minimal" size="lg" theme="dark" />
          </div>

          {/* Center: headline + features */}
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

          {/* Bottom: footer */}
          <p className="font-body text-xs text-white/30">
            &copy; 2026 TacticalSync Inc.
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center bg-white px-5 sm:px-8 py-10 sm:py-12 overflow-y-auto">
        <div className="w-full max-w-[420px] space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center">
            <Logo variant="full" size="xl" className="scale-90 sm:scale-100" />
          </div>

          {/* Email Verification Banner */}
          {showVerificationBanner ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="bg-platinum border border-rose-gold/30 rounded-2xl p-8 text-center">
                <div className="flex justify-center mb-5">
                  <div className="rounded-full bg-copper/10 p-4">
                    <Mail className="h-10 w-10 text-copper" />
                  </div>
                </div>
                <h3 className="font-heading text-2xl font-bold text-cast-iron mb-2">
                  Check Your Email
                </h3>
                <p className="font-body text-sm text-titanium mb-1">
                  We've sent a verification email to
                </p>
                <p className="font-body text-base font-semibold text-cast-iron mb-4 break-words">
                  {verificationEmail}
                </p>
                <p className="font-body text-titanium text-xs mb-6">
                  Click the link in the email to verify your account.
                  The link expires in 1 hour.
                </p>
                <div className="border-t border-rose-gold/20 pt-4 space-y-2">
                  <Button
                    variant="outline"
                    className="font-body w-full border-titanium/30 text-titanium hover:bg-titanium/5"
                    onClick={() => {
                      setShowVerificationBanner(false);
                      setIsSignUp(true);
                    }}
                  >
                    Try Again
                  </Button>
                  <Button
                    variant="link"
                    className="font-body w-full text-titanium"
                    onClick={() => {
                      setShowVerificationBanner(false);
                      setEmail("");
                      setIsSignUp(false);
                    }}
                  >
                    Back to Sign In
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : (
            <AnimatePresence mode="wait">
              {!showEmailForm ? (
                /* ── Default: Google + email options ── */
                <motion.div
                  key="options"
                  className="space-y-6"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Welcome copy */}
                  <div className="text-center space-y-2">
                    <h2 className="font-heading text-2xl sm:text-3xl font-bold text-cast-iron">
                      Welcome back
                    </h2>
                    <p className="font-body text-base text-titanium">
                      Sign in to continue to TacticalSync
                    </p>
                  </div>

                  {/* Google */}
                  <Button
                    type="button"
                    variant="outline"
                    className="font-body w-full h-12 text-base font-normal bg-white text-cast-iron border border-rose-gold/40 shadow-sm hover:shadow-md hover:border-rose-gold/60 transition-all"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                  >
                    <div className="flex items-center justify-center gap-3">
                      <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      <span>Sign in with Google</span>
                    </div>
                  </Button>

                  {/* Divider */}
                  <div className="relative flex items-center">
                    <div className="flex-1 border-t border-rose-gold/20" />
                    <span className="px-4 text-xs text-titanium/60 font-medium uppercase tracking-wider">or</span>
                    <div className="flex-1 border-t border-rose-gold/20" />
                  </div>

                  {/* Email options */}
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="font-body w-full h-11 text-base font-normal text-titanium hover:bg-platinum hover:text-cast-iron transition-colors"
                      onClick={() => {
                        setShowEmailForm(true);
                        setIsSignUp(false);
                        setActiveTab("signin");
                      }}
                      disabled={loading}
                    >
                      Log in with my email
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="font-body w-full h-11 text-base font-normal text-titanium hover:bg-platinum hover:text-cast-iron transition-colors"
                      onClick={() => {
                        setShowEmailForm(true);
                        setIsSignUp(true);
                        setActiveTab("signup");
                      }}
                      disabled={loading}
                    >
                      I need to register
                    </Button>
                  </div>
                </motion.div>
              ) : (
                /* ── Email form ── */
                <motion.div
                  key="email-form"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {/* Back button */}
                  <Button
                    type="button"
                    variant="ghost"
                    className="p-0 h-auto hover:bg-transparent text-titanium hover:text-cast-iron -ml-1"
                    onClick={() => {
                      setShowEmailForm(false);
                      setIsSignUp(false);
                      setIsForgotPassword(false);
                    }}
                  >
                    <ArrowLeft className="h-5 w-5 mr-2" />
                    <span className="font-body text-sm">Back</span>
                  </Button>

                  {!isForgotPassword ? (
                    <>
                      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 h-11 bg-platinum/60">
                          <TabsTrigger
                            value="signin"
                            onClick={() => { setIsSignUp(false); setActiveTab("signin"); }}
                            className="font-body text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
                          >
                            Sign In
                          </TabsTrigger>
                          <TabsTrigger
                            value="signup"
                            onClick={() => { setIsSignUp(true); setActiveTab("signup"); }}
                            className="font-body text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
                          >
                            Sign Up
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>

                      <div>
                        <h3 className="font-heading text-xl font-bold text-cast-iron">
                          {isSignUp ? "Create your account" : "Welcome back"}
                        </h3>
                        <p className="font-body text-sm text-titanium mt-1">
                          {isSignUp ? "Enter your details to get started" : "Enter your credentials to sign in"}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <h3 className="font-heading text-xl font-bold text-cast-iron">
                        Reset Password
                      </h3>
                      <p className="font-body text-sm text-titanium mt-1">
                        Enter your email to receive a reset link
                      </p>
                    </div>
                  )}

                  <form onSubmit={isForgotPassword ? handleForgotPassword : handleEmailAuth} className="space-y-4">
                    {!isForgotPassword && (
                      <input
                        type="text"
                        name="username"
                        autoComplete="username"
                        value={email}
                        readOnly
                        tabIndex={-1}
                        aria-hidden="true"
                        style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}
                      />
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="font-body text-sm font-medium text-cast-iron">
                        Email address
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        className="h-11 text-base border-rose-gold/30 focus:border-copper focus:ring-copper/20"
                        autoComplete={isForgotPassword ? "email" : isSignUp ? "email" : "username"}
                        required
                      />
                    </div>

                    {!isForgotPassword && (
                      <div className="space-y-1.5">
                        <Label htmlFor="password" className="font-body text-sm font-medium text-cast-iron">
                          Password
                        </Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={loading}
                          className="h-11 text-base border-rose-gold/30 focus:border-copper focus:ring-copper/20"
                          autoComplete={isSignUp ? "new-password" : "current-password"}
                          required
                          minLength={6}
                        />
                      </div>
                    )}

                    <Button
                      type="submit"
                      className="font-body w-full h-11 text-base font-medium bg-[#4A5D5F] hover:bg-[#3d4f51] text-white transition-colors"
                      disabled={loading}
                    >
                      {loading ? "Loading..." : (isForgotPassword ? "Send Reset Link" : (isSignUp ? "Create Account" : "Sign In"))}
                    </Button>
                  </form>

                  {/* Secondary actions */}
                  <div className="text-center">
                    {!isForgotPassword && !isSignUp && (
                      <Button
                        type="button"
                        variant="link"
                        className="font-body text-sm text-titanium hover:text-cast-iron"
                        onClick={() => setIsForgotPassword(true)}
                        disabled={loading}
                      >
                        Forgot password?
                      </Button>
                    )}
                    {isForgotPassword && (
                      <Button
                        type="button"
                        variant="link"
                        className="font-body text-sm text-titanium hover:text-cast-iron"
                        onClick={() => setIsForgotPassword(false)}
                        disabled={loading}
                      >
                        Back to sign in
                      </Button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
