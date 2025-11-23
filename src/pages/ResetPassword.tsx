import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    // Check if token is in query params - if so, redirect to Supabase verify
    const token = searchParams.get('token');
    const type = searchParams.get('type');
    
    if (token && type === 'recovery') {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const redirectTo = `${window.location.origin}/reset-password`;
      window.location.href = `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(token)}&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}`;
      return;
    }

    // Check for token in hash (after Supabase redirects back)
    const hash = window.location.hash;
    if (!hash.includes('access_token=')) {
      // Wait a bit for Supabase to process
      const timer = setTimeout(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.error("Invalid or expired reset link");
          navigate("/auth");
        } else {
          setVerifying(false);
          window.history.replaceState({}, '', '/reset-password');
        }
      }, 2000);
      return () => clearTimeout(timer);
    }

    // Token in hash - Supabase should process it automatically
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setVerifying(false);
        window.history.replaceState({}, '', '/reset-password');
      } else {
        // Wait and check again
        setTimeout(checkSession, 1000);
      }
    };

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY')) {
        setVerifying(false);
        window.history.replaceState({}, '', '/reset-password');
      }
    });

    checkSession();

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate, searchParams]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      toast.error("Please enter a new password");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      // Verify we have a session before updating password
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Session expired. Please request a new reset link.");
        navigate("/auth");
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      toast.success("Password updated successfully!");
      
      // Sign out and redirect to auth page for fresh login
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update password";
      console.error('[ResetPassword] Error updating password:', errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <GridBackground inverted className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-3 sm:px-4 py-8">
        <Card className="border-border/100 shadow-lg shadow-[#C97D60]/10 w-full sm:max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground">Verifying reset link...</p>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Please wait while we verify your reset link
            </p>
          </CardContent>
        </Card>
      </GridBackground>
    );
  }

  return (
    <GridBackground inverted className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-3 sm:px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-6">
            <Logo variant="full" size="xl" />
          </div>
          <h1 className="text-2xl font-bold">Choose New Password</h1>
          <p className="text-muted-foreground">
            Enter your new password below
          </p>
        </div>

        <Card className="border-border/100 shadow-large shadow-pink-500/100">
          <CardHeader>
            <CardTitle>Reset Password</CardTitle>
            <CardDescription>
              Your password must be at least 6 characters long
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="h-12 text-base"
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="h-12 text-base"
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-medium"
                disabled={loading}
              >
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </GridBackground>
  );
};

export default ResetPassword;
