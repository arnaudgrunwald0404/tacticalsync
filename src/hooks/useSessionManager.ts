import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes before expiry
const CHECK_INTERVAL = 60 * 1000; // Check every minute

export function useSessionManager() {
  const navigate = useNavigate();
  const lastActivity = useRef(Date.now());
  const checkInterval = useRef<number>();

  const updateLastActivity = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('No active session found during refresh attempt');
        // Don't immediately redirect, let the user finish their current action
        return;
      }

      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('Failed to refresh session:', error);
        // Don't immediately redirect, let the user finish their current action
      }
    } catch (error) {
      console.error('Error during session refresh:', error);
      // Don't immediately redirect, let the user finish their current action
    }
  }, []);

  const checkSession = useCallback(async () => {
    // Don't redirect if there's an access_token in the hash fragment
    // Supabase will process it automatically with detectSessionInUrl: true
    const hash = window.location.hash;
    const hasAccessToken = hash.includes('access_token=');
    
    // Don't redirect if we're on the reset password page (user needs to set new password)
    const isResetPasswordPage = window.location.pathname === '/reset-password';
    
    // Also check for recovery token in query params
    const searchParams = new URLSearchParams(window.location.search);
    const hasRecoveryToken = searchParams.has('token') && searchParams.get('type') === 'recovery';
    
    if (hasAccessToken || isResetPasswordPage || hasRecoveryToken) {
      // Wait for Supabase to process the token or let user complete password reset
      return;
    }
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // Only redirect if we're not on the auth page already
      if (window.location.pathname !== '/auth') {
        navigate('/auth');
      }
      return;
    }

    const now = Date.now();
    const idleTime = now - lastActivity.current;

    // Check if user has been idle
    if (idleTime >= IDLE_TIMEOUT) {
      console.log('Session expired due to inactivity');
      await supabase.auth.signOut();
      navigate('/auth');
      return;
    }

    // Get expiry time of the access token
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    const timeUntilExpiry = expiresAt - now;

    // Refresh session if we're within the threshold of expiry
    if (timeUntilExpiry <= REFRESH_THRESHOLD) {
      await refreshSession();
    }
  }, [navigate, refreshSession]);

  useEffect(() => {
    // Set up activity listeners
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(event => {
      window.addEventListener(event, updateLastActivity);
    });

    // Check if there's an access_token in hash or if we're on reset password page
    const hash = window.location.hash;
    const hasAccessToken = hash.includes('access_token=');
    const isResetPasswordPage = window.location.pathname === '/reset-password';
    const searchParams = new URLSearchParams(window.location.search);
    const hasRecoveryToken = searchParams.has('token') && searchParams.get('type') === 'recovery';
    
    // If there's an access_token or we're on reset password page, wait before starting checks
    // to let Supabase process the token first
    if (hasAccessToken || isResetPasswordPage || hasRecoveryToken) {
      setTimeout(() => {
        checkInterval.current = window.setInterval(checkSession, CHECK_INTERVAL);
        // Initial session check after delay
        checkSession();
      }, 2000); // Longer delay for password reset
    } else {
      // Start session check interval immediately
      checkInterval.current = window.setInterval(checkSession, CHECK_INTERVAL);
      // Initial session check
      checkSession();
    }

    return () => {
      // Cleanup
      events.forEach(event => {
        window.removeEventListener(event, updateLastActivity);
      });
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
      }
    };
  }, [checkSession, updateLastActivity]);
}
