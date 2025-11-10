import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface PresenceUser {
  userId: string;
  userName: string;
  userEmail?: string;
  avatarUrl?: string;
  onlineAt: string;
  viewingSection?: string;
}

interface UsePresenceOptions {
  roomId: string;
  userName: string;
  userEmail?: string;
  avatarUrl?: string;
  enabled?: boolean;
}

/**
 * Hook to track presence (who's online) in a specific room/meeting
 * Shows which users are currently viewing the same content
 */
export function usePresence({
  roomId,
  userName,
  userEmail,
  avatarUrl,
  enabled = true,
}: UsePresenceOptions) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    fetchCurrentUser();
  }, []);

  const updatePresence = useCallback((section?: string) => {
    if (channelRef.current && currentUserId) {
      channelRef.current.track({
        userId: currentUserId,
        userName,
        userEmail,
        avatarUrl,
        onlineAt: new Date().toISOString(),
        viewingSection: section,
      });
    }
  }, [currentUserId, userName, userEmail, avatarUrl]);

  useEffect(() => {
    if (!enabled || !roomId || !currentUserId) return;

    const channelName = `presence:${roomId}`;
    
    // Create presence channel
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    });

    // Handle presence sync (initial state + any changes)
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: PresenceUser[] = [];
        
        Object.keys(state).forEach((key) => {
          const presences = state[key] as any[];
          presences.forEach((presence) => {
            users.push({
              userId: presence.userId,
              userName: presence.userName,
              userEmail: presence.userEmail,
              avatarUrl: presence.avatarUrl,
              onlineAt: presence.onlineAt,
              viewingSection: presence.viewingSection,
            });
          });
        });
        
        setOnlineUsers(users);
        console.log('[Presence] Online users:', users);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[Presence] User joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('[Presence] User left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Presence] Subscribed to room:', roomId);
          
          // Track current user's presence
          await channel.track({
            userId: currentUserId,
            userName,
            userEmail,
            avatarUrl,
            onlineAt: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [roomId, currentUserId, userName, userEmail, avatarUrl, enabled]);

  return {
    onlineUsers: onlineUsers.filter(u => u.userId !== currentUserId), // Exclude current user
    updatePresence,
    totalOnline: onlineUsers.length,
  };
}

