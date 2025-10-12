import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Calendar, CheckSquare, Mail } from "lucide-react";
import { toast } from "sonner";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";
import MovingBorder from "@/components/ui/moving-border";

const Auth = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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
      toast.error(error.message || "Failed to send reset email");
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
        toast.success("Account created! Please check your email inbox to confirm your email address before signing in.", {
          duration: 8000,
        });
        setIsSignUp(false);
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
      toast.error(error.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GridBackground inverted className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-8">
      <div className="space-y-6" style={{ width: '40vw', maxWidth: '800px' }}>
        {/* Logo Section */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <Logo variant="full" size="xl" />
          </div>

        </div>

        <Card className="border-border/50 shadow-large shadow-pink-500/100" style={{ width: '100%' }}>
          <CardHeader className="space-y-4 pb-6 px-16">
            {!isForgotPassword ? (
              <Tabs defaultValue="signin" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="signin" onClick={() => setIsSignUp(false)}>
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger value="signup" onClick={() => setIsSignUp(true)}>
                    Sign Up
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            ) : (
              <div className="space-y-2">
                <CardTitle className="text-2xl font-bold text-center">
                  Reset Password
                </CardTitle>
                <CardDescription className="text-center">
                  Enter your email to receive a reset link
                </CardDescription>
              </div>
            )}

            {/* Feature highlights - only show on sign in/up */}
            
          </CardHeader>

          <CardContent className="space-y-6 pt-0 px-16">
            {/* Google Sign In */}
            {!isForgotPassword && (
              <>
                <MovingBorder
                  borderRadius="0.5rem"
                  duration={3000}
        
                  className="w-full h-26 text-md font-normal bg-white text-gray-900"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  as="button"
                >
                  <div className="flex items-center justify-center gap-4 pt-4 pb-4">
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
                </MovingBorder>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or continue with email
                    </span>
                  </div>
                </div>
              </>
            )}
            {/* Email Form */}
            <form onSubmit={isForgotPassword ? handleForgotPassword : handleEmailAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="h-12"
                  required
                />
              </div>
              
              {!isForgotPassword && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="h-12"
                    required
                    minLength={6}
                  />
                </div>
              )}
              
              {/* Primary Action Button */}
              <Button
                type="submit"
                className="w-full h-12 text-base"
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
                  className="w-full text-sm text-muted-foreground"
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
                  className="w-full text-sm"
                  onClick={() => setIsForgotPassword(false)}
                  disabled={loading}
                >
                  Back to sign in
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </GridBackground>
  );
};

export default Auth;
