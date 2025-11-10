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
  const [activeTab, setActiveTab] = useState("signin");

  useEffect(() => {
    // Check for invite code and OAuth callback code in URL
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    const code = params.get('code');
    const hasCode = !!code;
    
    // Check for hash fragment with access_token (email verification/magic link)
    const hash = window.location.hash;
    const hasAccessToken = hash.includes('access_token=');
    
    // If there's a code parameter (PKCE/OAuth callback), wait for auth state change
    // Otherwise, check existing session immediately
    if (!hasCode && !hasAccessToken) {
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
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        // Clean up URL by removing code parameter and hash fragment after successful auth
        if (hasCode || hasAccessToken) {
          const currentParams = new URLSearchParams(window.location.search);
          const currentInviteCode = currentParams.get('invite');
          const newUrl = currentInviteCode ? `/auth?invite=${currentInviteCode}` : '/auth';
          window.history.replaceState({}, '', newUrl);
        }
        
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
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset email sent! Check your inbox.");
      
      // Try to get password reset link (works in both local and production)
      try {
        // Check if we're running locally based on window.location
        const isAppLocal = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          window.location.hostname.includes('localhost');
        
        // Check if Supabase is local
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const isSupabaseLocal = supabaseUrl && (supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1'));
        
        console.log('[DEBUG] Application hostname:', window.location.hostname);
        console.log('[DEBUG] Supabase URL:', supabaseUrl);
        console.log('[DEBUG] Is app local:', isAppLocal);
        console.log('[DEBUG] Is Supabase local:', isSupabaseLocal);
        
        // Only use local email service if BOTH app and Supabase are local
        if (isAppLocal && isSupabaseLocal) {
          // Local development: try to fetch from email service
          const url = new URL(supabaseUrl);
          const emailServiceUrl = `${url.protocol}//${url.hostname}:54324/emails`;
          console.log('[DEBUG] Attempting to fetch password reset emails from:', emailServiceUrl);
          
          // Try multiple times with increasing delays
          const tryFetchEmail = async (attempt: number, delay: number) => {
            await new Promise(resolve => setTimeout(resolve, delay));
            
            try {
              console.log(`[DEBUG] Password reset fetch attempt ${attempt}...`);
              const response = await fetch(emailServiceUrl);
              
              if (!response.ok) {
                console.log(`[DEBUG] Response not OK: ${response.status} ${response.statusText}`);
                if (attempt < 5) {
                  tryFetchEmail(attempt + 1, delay * 1.5);
                } else {
                  console.log('%c⚠️ Could not fetch emails after 5 attempts.', 'color: #FF9800; font-size: 12px;');
                }
                return;
              }
              
              const emails = await response.json();
              console.log(`[DEBUG] Found ${emails?.length || 0} emails total`);
              
              if (!emails || !Array.isArray(emails)) {
                console.log('[DEBUG] Unexpected email response format:', emails);
                return;
              }
              
              // Find password reset emails for this user
              const userEmails = emails.filter((email: any) => {
                const emailTo = (email.to?.toLowerCase() || email.recipient?.toLowerCase() || '');
                const subject = (email.subject?.toLowerCase() || '');
                return emailTo === trimmedEmail.toLowerCase() && 
                       (subject.includes('reset') || subject.includes('password'));
              });
              
              console.log(`[DEBUG] Found ${userEmails.length} password reset emails for ${trimmedEmail}`);
              
              if (userEmails.length === 0) {
                console.log('%c⚠️ No password reset email found for', 'color: #FF9800;', trimmedEmail);
                console.log('Available emails:', emails.slice(0, 5).map((e: any) => ({ 
                  to: e.to || e.recipient, 
                  subject: e.subject,
                  created: e.created_at || e.createdAt
                })));
                
                if (attempt < 5) {
                  tryFetchEmail(attempt + 1, delay * 1.5);
                }
                return;
              }
              
              const userEmail = userEmails.sort((a: any, b: any) => {
                const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
                const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
                return dateB - dateA;
              })[0];
              
              console.log('[DEBUG] Most recent password reset email:', { 
                subject: userEmail.subject,
                to: userEmail.to || userEmail.recipient
              });
              
              // Extract reset link from email HTML or text
              const htmlContent = userEmail.html || userEmail.text || userEmail.body || '';
              
              // Try multiple patterns to find the reset link
              const patterns = [
                /href=["']([^"']*reset[^"']*token=[^"']*)["']/i,
                /href=["']([^"']*password[^"']*token=[^"']*)["']/i,
                /href=["']([^"']*\/auth\/v1\/.*recover[^"']*)["']/i,
                /href=["']([^"']*\/auth\/v1\/.*reset[^"']*)["']/i,
                /(https?:\/\/[^\s<>"']*reset[^\s<>"']*token=[^\s<>"']*)/i,
                /(https?:\/\/[^\s<>"']*password[^\s<>"']*token=[^\s<>"']*)/i,
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
                console.log('%c' + resetLink, 'color: #2196F3; font-size: 12px; word-break: break-all; padding: 8px; background: #f5f5f5; border-radius: 4px; display: block;');
                console.log('%c📋 Copy this link to reset your password (works even with fake emails)', 'color: #666; font-size: 11px; font-style: italic; margin-top: 4px;');
              } else {
                // Try to find any URL in the email
                const urlMatch = htmlContent.match(/(https?:\/\/[^\s<>"']+)/i);
                if (urlMatch) {
                  console.log('%c🔗 Possible password reset link found:', 'background: #FF9800; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
                  console.log('%c' + urlMatch[1], 'color: #2196F3; font-size: 12px; word-break: break-all;');
                } else {
                  console.log('%c⚠️ Could not extract password reset link from email.', 'color: #FF9800; font-size: 12px;');
                  console.log('Email service URL:', emailServiceUrl);
                  console.log('Email subject:', userEmail.subject);
                  console.log('Email preview (first 500 chars):', htmlContent.substring(0, 500));
                  console.log('%c💡 Tip: Check Supabase Studio at http://localhost:54323 or terminal logs for the reset link', 'color: #2196F3; font-size: 11px;');
                }
              }
            } catch (emailErr: any) {
              console.log(`[DEBUG] Password reset fetch error on attempt ${attempt}:`, emailErr);
              if (attempt < 5) {
                tryFetchEmail(attempt + 1, delay * 1.5);
              } else {
                console.log('%c⚠️ Could not fetch email from local service after 5 attempts:', 'color: #FF9800;', emailErr?.message || emailErr);
                console.log('Email service URL:', emailServiceUrl);
                console.log('%c💡 Tip: Make sure Supabase is running locally and email service is on port 54324', 'color: #2196F3; font-size: 11px;');
                console.log('%c💡 Check Supabase logs or Studio at http://localhost:54323 for the reset link', 'color: #2196F3; font-size: 11px;');
              }
            }
          };
          
          // Start fetching with initial delay
          tryFetchEmail(1, 500);
        } else {
          // Production: password reset email is already sent by Supabase via resetPasswordForEmail
          // No need to generate link - Supabase handles it automatically
          console.log('[DEBUG] Production mode: password reset email sent by Supabase');
          console.log('%c💡 Password reset email has been sent. Please check your inbox.', 'color: #2196F3; font-size: 11px;');
          console.log('%cNote: For security reasons, Supabase sends the email even if the user doesn\'t exist.', 'color: #666; font-size: 10px; font-style: italic;');
        }
      } catch (err: any) {
        console.log('[DEBUG] Error setting up password reset email fetch:', err?.message || err);
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
        console.log("[DEBUG] Starting signup for:", trimmedEmail);
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        
        console.log("[DEBUG] SignUp response:", { 
          hasSession: !!data.session, 
          hasUser: !!data.user,
          userEmail: data.user?.email,
          userConfirmed: data.user?.email_confirmed_at,
          error: error?.message 
        });
        
        if (error) throw error;

        // Try to get verification link (works in both local and production)
        if (data.user && !data.session) {
          try {
            // Check if we're running locally based on window.location
            const isAppLocal = window.location.hostname === 'localhost' || 
                              window.location.hostname === '127.0.0.1' ||
                              window.location.hostname.includes('localhost');
            
            // Check if Supabase is local
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const isSupabaseLocal = supabaseUrl && (supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1'));
            
            console.log('[DEBUG] Application hostname:', window.location.hostname);
            console.log('[DEBUG] Supabase URL:', supabaseUrl);
            console.log('[DEBUG] Is app local:', isAppLocal);
            console.log('[DEBUG] Is Supabase local:', isSupabaseLocal);
            
            // Only use local email service if BOTH app and Supabase are local
            if (isAppLocal && isSupabaseLocal) {
              // Local development: try to fetch from email service
              const url = new URL(supabaseUrl);
              const emailServiceUrl = `${url.protocol}//${url.hostname}:54324/emails`;
              console.log('[DEBUG] Attempting to fetch emails from:', emailServiceUrl);
              
              // Try multiple times with increasing delays
              const tryFetchEmail = async (attempt: number, delay: number) => {
                await new Promise(resolve => setTimeout(resolve, delay));
                
                try {
                  console.log(`[DEBUG] Fetch attempt ${attempt}...`);
                  const response = await fetch(emailServiceUrl);
                  
                  if (!response.ok) {
                    console.log(`[DEBUG] Response not OK: ${response.status} ${response.statusText}`);
                    if (attempt < 5) {
                      // Retry with longer delay
                      tryFetchEmail(attempt + 1, delay * 1.5);
                    } else {
                      console.log('%c⚠️ Could not fetch emails after 5 attempts. Check if Supabase email service is running on port 54324.', 'color: #FF9800; font-size: 12px;');
                    }
                    return;
                  }
                  
                  const emails = await response.json();
                  console.log(`[DEBUG] Found ${emails?.length || 0} emails total`);
                  
                  if (!emails || !Array.isArray(emails)) {
                    console.log('[DEBUG] Unexpected email response format:', emails);
                    return;
                  }
                  
                  // Find the most recent email for this user
                  const userEmails = emails.filter((email: any) => {
                    const emailTo = email.to?.toLowerCase() || email.recipient?.toLowerCase() || '';
                    return emailTo === trimmedEmail.toLowerCase();
                  });
                  
                  console.log(`[DEBUG] Found ${userEmails.length} emails for ${trimmedEmail}`);
                  
                  if (userEmails.length === 0) {
                    console.log('%c⚠️ No email found for', 'color: #FF9800;', trimmedEmail);
                    console.log('Available emails:', emails.slice(0, 5).map((e: any) => ({ 
                      to: e.to || e.recipient, 
                      subject: e.subject,
                      created: e.created_at || e.createdAt
                    })));
                    
                    if (attempt < 3) {
                      // Retry with longer delay
                      tryFetchEmail(attempt + 1, delay * 1.5);
                    } else {
                      // Fallback to Edge Function after 3 attempts
                      console.log('%c💡 Falling back to Edge Function...', 'color: #2196F3; font-size: 11px;');
                      tryGetLinkFromFunction();
                    }
                    return;
                  }
                  
                  const userEmail = userEmails.sort((a: any, b: any) => {
                    const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
                    const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
                    return dateB - dateA;
                  })[0];
                  
                  console.log('[DEBUG] Most recent email:', { 
                    subject: userEmail.subject,
                    to: userEmail.to || userEmail.recipient,
                    hasHtml: !!userEmail.html,
                    hasText: !!userEmail.text
                  });
                  
                  // Extract verification link from email HTML or text
                  const htmlContent = userEmail.html || userEmail.text || userEmail.body || '';
                  
                  // Try multiple patterns to find the verification link
                  const patterns = [
                    /href=["']([^"']*confirmation[^"']*token=[^"']*)["']/i,
                    /href=["']([^"']*verify[^"']*token=[^"']*)["']/i,
                    /href=["']([^"']*\/auth\/v1\/verify[^"']*)["']/i,
                    /href=["']([^"']*\/auth\/v1\/.*token=[^"']*)["']/i,
                    /(https?:\/\/[^\s<>"']*confirmation[^\s<>"']*token=[^\s<>"']*)/i,
                    /(https?:\/\/[^\s<>"']*verify[^\s<>"']*token=[^\s<>"']*)/i,
                    /(https?:\/\/[^\s<>"']*\/auth\/v1\/verify[^\s<>"']*)/i,
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
                    console.log('%c' + verificationLink, 'color: #2196F3; font-size: 12px; word-break: break-all; padding: 8px; background: #f5f5f5; border-radius: 4px; display: block;');
                    console.log('%c📋 Copy this link to verify your email (works even with fake emails)', 'color: #666; font-size: 11px; font-style: italic; margin-top: 4px;');
                  } else {
                    // Try to find any URL in the email
                    const urlMatch = htmlContent.match(/(https?:\/\/[^\s<>"']+)/i);
                    if (urlMatch) {
                      console.log('%c🔗 Possible verification link found:', 'background: #FF9800; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
                      console.log('%c' + urlMatch[1], 'color: #2196F3; font-size: 12px; word-break: break-all;');
                    } else {
                      console.log('%c⚠️ Could not extract verification link from email.', 'color: #FF9800; font-size: 12px;');
                      console.log('Email service URL:', emailServiceUrl);
                      console.log('Email subject:', userEmail.subject);
                      console.log('Email preview (first 500 chars):', htmlContent.substring(0, 500));
                      console.log('%c💡 Falling back to Edge Function...', 'color: #2196F3; font-size: 11px;');
                      // Fallback to Edge Function
                      tryGetLinkFromFunction();
                    }
                  }
                } catch (emailErr: any) {
                  console.log(`[DEBUG] Fetch error on attempt ${attempt}:`, emailErr);
                  if (attempt < 5) {
                    // Retry with longer delay
                    tryFetchEmail(attempt + 1, delay * 1.5);
                  } else {
                    console.log('%c⚠️ Could not fetch email from local service after 5 attempts:', 'color: #FF9800;', emailErr?.message || emailErr);
                    console.log('Email service URL:', emailServiceUrl);
                    console.log('%c💡 Falling back to Edge Function...', 'color: #2196F3; font-size: 11px;');
                    // Fallback to Edge Function
                    tryGetLinkFromFunction();
                  }
                }
              };
              
              // Function to get link from Edge Function (fallback)
              async function tryGetLinkFromFunction() {
                try {
                  console.log('[DEBUG] Attempting to get verification link from Edge Function...');
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
                    console.log('%c🔗 VERIFICATION LINK:', 'background: #4CAF50; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 14px;');
                    console.log('%c' + responseData.link, 'color: #2196F3; font-size: 12px; word-break: break-all; padding: 8px; background: #f5f5f5; border-radius: 4px; display: block;');
                    if (responseData.note) {
                      console.log('%c📝 ' + responseData.note, 'color: #666; font-size: 11px; font-style: italic; margin-top: 4px;');
                    }
                    console.log('%c📋 Copy this link to verify your email (works even with fake emails)', 'color: #666; font-size: 11px; font-style: italic; margin-top: 4px;');
                  } else {
                    console.log('%c⚠️ Could not get verification link:', 'color: #FF9800; font-size: 12px; font-weight: bold;');
                    console.log('%c' + (responseData?.error || 'Unknown error'), 'color: #FF5722; font-size: 12px;');
                    console.log('[DEBUG] Response status:', response.status);
                    console.log('[DEBUG] Response data:', responseData);
                    
                    if (responseData?.userExists !== undefined) {
                      console.log('[DEBUG] User exists:', responseData.userExists);
                    }
                    if (responseData?.userConfirmed !== undefined) {
                      console.log('[DEBUG] User confirmed:', responseData.userConfirmed);
                    }
                    if (responseData?.userProviders && responseData.userProviders.length > 0) {
                      console.log('[DEBUG] User providers:', responseData.userProviders);
                      console.log('%c💡 This email is already registered with:', 'color: #2196F3; font-size: 11px;', responseData.userProviders.join(', '));
                      console.log('%c💡 Try signing in with that provider instead, or use password reset if you have a password set.', 'color: #2196F3; font-size: 11px;');
                    }
                    
                    if (responseData?.details) {
                      console.log('[DEBUG] Error details:', responseData.details);
                    }
                    console.log('%c💡 Check your email inbox or Supabase Dashboard for the verification link', 'color: #2196F3; font-size: 11px;');
                  }
                } catch (err: any) {
                  console.log('[DEBUG] Error calling get-verification-link function:', err?.message || err);
                  console.log('[DEBUG] Full error:', err);
                  console.log('%c💡 Check your email inbox or Supabase Dashboard for the verification link', 'color: #2196F3; font-size: 11px;');
                }
              }
              
              // Start fetching with initial delay
              tryFetchEmail(1, 500);
            } else {
              // Production: use Edge Function to generate verification link
              console.log('[DEBUG] Production mode: using Edge Function to get verification link');
              try {
                // Use fetch directly to get better error details
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
                  console.log('%c🔗 VERIFICATION LINK:', 'background: #4CAF50; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 14px;');
                  console.log('%c' + responseData.link, 'color: #2196F3; font-size: 12px; word-break: break-all; padding: 8px; background: #f5f5f5; border-radius: 4px; display: block;');
                  if (responseData.note) {
                    console.log('%c📝 ' + responseData.note, 'color: #666; font-size: 11px; font-style: italic; margin-top: 4px;');
                  }
                  console.log('%c📋 Copy this link to verify your email (works even with fake emails)', 'color: #666; font-size: 11px; font-style: italic; margin-top: 4px;');
                } else {
                  console.log('%c⚠️ Could not get verification link:', 'color: #FF9800; font-size: 12px; font-weight: bold;');
                  console.log('%c' + (responseData?.error || 'Unknown error'), 'color: #FF5722; font-size: 12px;');
                  console.log('[DEBUG] Response status:', response.status);
                  console.log('[DEBUG] Response data:', responseData);
                  
                  if (responseData?.userExists !== undefined) {
                    console.log('[DEBUG] User exists:', responseData.userExists);
                  }
                  if (responseData?.userConfirmed !== undefined) {
                    console.log('[DEBUG] User confirmed:', responseData.userConfirmed);
                  }
                  if (responseData?.userProviders && responseData.userProviders.length > 0) {
                    console.log('[DEBUG] User providers:', responseData.userProviders);
                    console.log('%c💡 This email is already registered with:', 'color: #2196F3; font-size: 11px;', responseData.userProviders.join(', '));
                    console.log('%c💡 Try signing in with that provider instead, or use password reset if you have a password set.', 'color: #2196F3; font-size: 11px;');
                  }
                  
                  if (responseData?.details) {
                    console.log('[DEBUG] Error details:', responseData.details);
                  }
                  console.log('%c💡 Check your email inbox or Supabase Dashboard for the verification link', 'color: #2196F3; font-size: 11px;');
                }
              } catch (err: any) {
                console.log('[DEBUG] Error calling get-verification-link function:', err?.message || err);
                console.log('[DEBUG] Full error:', err);
                console.log('%c💡 Check your email inbox or Supabase Dashboard for the verification link', 'color: #2196F3; font-size: 11px;');
              }
            }
          } catch (err: any) {
            console.log('[DEBUG] Error setting up email fetch:', err?.message || err);
          }
        }
        
        const session = data.session;
        
        if (session) {
          console.log("[DEBUG] Session found! Redirecting to dashboard...");
          toast.success("Account created successfully!");
          // Check for invite code
          const params = new URLSearchParams(window.location.search);
          const inviteCode = params.get('invite');
          const storedInvite = localStorage.getItem('pendingInviteCode');
          
          if (storedInvite) {
            localStorage.removeItem('pendingInviteCode');
            navigate(`/join/${storedInvite}`);
          } else if (inviteCode) {
            navigate(`/join/${inviteCode}`);
          } else {
            navigate("/dashboard");
          }
        } else {
          console.log("[DEBUG] No session found - showing verification banner");
          // No session means email verification is required
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

  return (
    <GridBackground inverted className="min-h-screen flex items-center justify-center bg-blue-50 overscroll-none px-3 sm:px-4 py-8">
      <div className="w-full max-w-full  space-y-6">
       

        <Card className="border-border/100 shadow-large shadow-pink-500/100 w-full  sm:max-w-full">

 {/* Logo Section */}
 <div className="text-center space-y-2">
          <div className="flex justify-center mt-12 mb-6">
            <Logo variant="full" size="xl" className="scale-90 sm:scale-100" />
          </div>

        </div>

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
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4 h-12 sm:h-14">
                      <TabsTrigger value="signin" onClick={() => {
                        setIsSignUp(false);
                        setActiveTab("signin");
                      }} className="text-base sm:text-lg">
                        Sign In
                      </TabsTrigger>
                      <TabsTrigger value="signup" onClick={() => {
                        setIsSignUp(true);
                        setActiveTab("signup");
                      }} className="text-base sm:text-lg">
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
                <CardTitle className="text-2xl sm:text-3xl font-bold mb-6">
                  We are so glad you're here!
                </CardTitle>
                <CardDescription className="text-base sm:text-lg mb-6">
                  Sign in to continue to TacticalSync
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
                    className="space-y-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-12 text-base sm:text-lg font-normal bg-white text-gray-900 border-2 border-blue-600 shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors"
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

                    <div className="relative flex items-center justify-center mt-6 py-6">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300"></div>
                      </div>
                      <div className="relative bg-white px-4">
                        <span className="text-sm text-gray-500 font-medium">OR</span>
                      </div>
                    </div>

                    <div >
                      <Button
                        type="button"
        
                        className="w-full h-12 sm:text-lg font-normal bg-white text-gray-600 hover:bg-gray-50 mt-0 py-0"
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
                 
                        className="w-full h-12 sm:text-lg font-normal bg-white text-gray-600 hover:bg-gray-50"
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
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {!isForgotPassword && (
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-1">
                          {isSignUp ? "Create your account" : "Welcome back!"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {isSignUp ? "Enter your details below to create your account" : "Enter your email and password to sign in"}
                        </p>
                      </div>
                    )}
                    <form onSubmit={isForgotPassword ? handleForgotPassword : handleEmailAuth} className="space-y-5">
                      {/* Hidden username field for accessibility (password forms should have username fields) */}
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
                          autoComplete={isForgotPassword ? "email" : isSignUp ? "email" : "username"}
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
                            autoComplete={isSignUp ? "new-password" : "current-password"}
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
                      {!isForgotPassword && !isSignUp && (
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
