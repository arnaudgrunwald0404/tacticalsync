import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSessionManager } from "@/hooks/useSessionManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Calendar, CheckSquare, Mail } from "lucide-react";
import { toast } from "sonner";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";

const Auth = () => {
  // Initialize session management
  useSessionManager();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showVerificationBanner, setShowVerificationBanner] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");

  useEffect(() => {
    // Check for invite code in URL
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // If logged in and has invite code, redirect to join page
        if (inviteCode) {
          navigate(`/join/${inviteCode}`);
        } else {
          navigate("/dashboard");
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        // Check for stored invite code after successful auth
        const storedInvite = localStorage.getItem('pendingInviteCode');
        if (storedInvite) {
          localStorage.removeItem('pendingInviteCode');
          navigate(`/join/${storedInvite}`);
        } else if (inviteCode) {
          navigate(`/join/${inviteCode}`);
        } else {
          navigate("/dashboard");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
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
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast.success("Password reset email sent! Check your inbox.");
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

    // Basic email validation
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
        const { error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (error) throw error;
        
        // Show verification banner instead of toast
        setVerificationEmail(trimmedEmail);
        setShowVerificationBanner(true);
        setPassword("");
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

  return (
    <GridBackground inverted className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-3 sm:px-4 py-8">
      <div className="w-full max-w-full  space-y-6">
        {/* Logo Section */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <Logo variant="full" size="lg" className="scale-90 sm:scale-100" />
          </div>

        </div>

        <Card className="border-border/50 shadow-large shadow-pink-500/100 w-full  sm:max-w-full">
          <CardHeader className="space-y-4 pb-6 px-5 sm:px-8 md:px-12">
            {showEmailForm ? (
              <>
                <div className="flex items-center mb-4">
                  <Button
                    type="button"
                    variant="ghost"
                    className="p-0 h-auto hover:bg-transparent"
                    onClick={() => {
                      setShowEmailForm(false);
                      setIsSignUp(false);
                      setIsForgotPassword(false);
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-6 w-6"
                    >
                      <path d="m15 18-6-6 6-6"/>
                    </svg>
                    <span className="ml-2">Back</span>
                  </Button>
                </div>
                {!isForgotPassword ? (
                  <Tabs defaultValue="signin" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4 h-12 sm:h-14">
                      <TabsTrigger value="signin" onClick={() => setIsSignUp(false)} className="text-base sm:text-lg">
                        Sign In
                      </TabsTrigger>
                      <TabsTrigger value="signup" onClick={() => setIsSignUp(true)} className="text-base sm:text-lg">
                        Sign Up
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                ) : (
                  <div className="space-y-2">
                    <CardTitle className="text-2xl sm:text-3xl font-bold text-center">
                      Reset Password
                    </CardTitle>
                    <CardDescription className="text-base sm:text-lg text-center">
                      Enter your email to receive a reset link
                    </CardDescription>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center space-y-2">
                <CardTitle className="text-2xl sm:text-3xl font-bold">
                  We are so glad you're here!
                </CardTitle>
                <CardDescription className="text-base sm:text-lg">
                  Sign in to continue to Team TacticalSync
                </CardDescription>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-6 pt-0 px-5 sm:px-8 md:px-12">
            {/* Email Verification Banner */}
            {showVerificationBanner ? (
              <div className="py-6 sm:py-8 space-y-6">
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 sm:p-6 md:p-8 text-center">
                  <div className="flex justify-center mb-4">
                    <Mail className="h-16 w-16 sm:h-16 sm:w-16 text-blue-600" />
                  </div>
                  <h3 className="text-2xl sm:text-2xl font-bold text-blue-900 mb-3">
                    Check Your Email
                  </h3>
                  <p className="text-base sm:text-base text-blue-800 mb-2">
                    We've sent a verification email to:
                  </p>
                  <p className="text-lg sm:text-lg font-semibold text-blue-900 mb-4 break-words">
                    {verificationEmail}
                  </p>
                  <p className="text-blue-700 text-sm sm:text-sm mb-6">
                    Click the link in the email to verify your account and complete your sign up.
                    The link will expire in 1 hour.
                  </p>
                  <div className="border-t border-blue-200 pt-4 mt-4">
                    <p className="text-sm text-blue-600 mb-3">
                      Didn't receive the email?
                    </p>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={() => {
                          setShowVerificationBanner(false);
                          setIsSignUp(true);
                        }}
                      >
                        Try Again
                      </Button>
                      <Button
                        variant="link"
                        className="text-blue-600"
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
                </div>
              </div>
            ) : (
              <>
                <AnimatePresence mode="wait">
                  {!showEmailForm ? (
                  <motion.div
                    className="space-y-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-12 text-base sm:text-lg font-normal bg-white text-gray-900 border-2 border-gray-300 hover:bg-gray-50"
                      onClick={handleGoogleSignIn}
                      disabled={loading}
                    >
                      <div className="flex items-center justify-center gap-3">
                        <svg className="h-6 w-6" viewBox="0 0 24 24">
                          <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            fill="#4285F4"
                          />
                          <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                          />
                          <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            fill="#FBBC05"
                          />
                          <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                          />
                        </svg>
                        <span>Sign in with Google</span>
                      </div>
                    </Button>

                    <Button
                      type="button"
                      variant="link"
                      className="w-full text-base text-muted-foreground hover:text-primary"
                      onClick={() => setShowEmailForm(true)}
                      disabled={loading}
                    >
                      Want to use your email and password?
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {!isForgotPassword && (
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-1">
                          {isSignUp ? "Create your account" : "Sign in to your account"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {isSignUp ? "Enter your details below to create your account" : "Enter your email and password to sign in"}
                        </p>
                      </div>
                    )}
                    <form onSubmit={isForgotPassword ? handleForgotPassword : handleEmailAuth} className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-base sm:text-base font-medium">Email address</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={loading}
                          className="h-12 sm:h-12 text-base sm:text-base"
                          required
                        />
                      </div>
                      
                      {!isForgotPassword && (
                        <div className="space-y-2">
                          <Label htmlFor="password" className="text-base sm:text-base font-medium">Password</Label>
                          <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                            className="h-12 sm:h-12 text-base sm:text-base"
                            required
                            minLength={6}
                          />
                        </div>
                      )}
                      
                      {/* Primary Action Button */}
                      <Button
                        type="submit"
                        className="w-full h-12 sm:h-12 text-base sm:text-base font-medium"
                        disabled={loading}
                      >
                        {loading ? "Loading..." : (isForgotPassword ? "Send Reset Link" : (isSignUp ? "Sign Up" : "Sign In"))}
                      </Button>
                    </form>

                    {/* Secondary Actions */}
                    <div className="space-y-2 pt-2">
                      {!isForgotPassword && (
                        <Button
                          type="button"
                          variant="link"
                          className="w-full text-base text-muted-foreground"
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
                          className="w-full text-base"
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </GridBackground>
  );
};

export default Auth;
