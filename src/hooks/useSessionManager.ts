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
        navigate('/auth');
        return;
      }

      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('Failed to refresh session:', error);
        navigate('/auth');
      }
    } catch (error) {
      console.error('Error during session refresh:', error);
      navigate('/auth');
    }
  }, [navigate]);

  const checkSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
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

    // Start session check interval
    checkInterval.current = window.setInterval(checkSession, CHECK_INTERVAL);

    // Initial session check
    checkSession();

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
