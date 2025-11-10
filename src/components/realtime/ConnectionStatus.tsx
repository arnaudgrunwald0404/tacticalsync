import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

type ConnectionState = 'connected' | 'connecting' | 'disconnected';

/**
 * Component to display real-time connection status
 * Shows a visual indicator of the WebSocket connection state
 */
export function ConnectionStatus() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');

  useEffect(() => {
    // Check initial connection state
    const checkConnection = async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('id').limit(1);
        if (!error) {
          setConnectionState('connected');
        } else {
          setConnectionState('disconnected');
        }
      } catch (error) {
        setConnectionState('disconnected');
      }
    };

    checkConnection();

    // Listen to auth state changes which affect realtime connection
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setConnectionState('connected');
      } else if (event === 'SIGNED_OUT') {
        setConnectionState('disconnected');
      }
    });

    // Check connection periodically
    const interval = setInterval(() => {
      checkConnection();
    }, 30000); // Check every 30 seconds

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const getStatusConfig = () => {
    switch (connectionState) {
      case 'connected':
        return {
          icon: <Wifi className="h-4 w-4 text-green-600" />,
          text: 'Connected',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          description: 'Real-time sync active',
        };
      case 'connecting':
        return {
          icon: <RefreshCw className="h-4 w-4 text-yellow-600 animate-spin" />,
          text: 'Connecting',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          description: 'Establishing connection...',
        };
      case 'disconnected':
        return {
          icon: <WifiOff className="h-4 w-4 text-red-600" />,
          text: 'Offline',
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          description: 'Real-time sync unavailable',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bgColor} border border-current/20`}>
            {config.icon}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p className="font-medium">{config.description}</p>
            {connectionState === 'connected' && (
              <p className="text-xs text-muted-foreground mt-1">
                Changes sync automatically across all users
              </p>
            )}
            {connectionState === 'disconnected' && (
              <p className="text-xs text-muted-foreground mt-1">
                Check your internet connection
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

