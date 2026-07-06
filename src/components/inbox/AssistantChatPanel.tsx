import { Loader2, Check, Calendar, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChatBubble } from './ChatBubble';
import { connectGoogleCalendar, connectZoom } from '@/lib/calendarZoomConnect';

export interface AssistantChatMsg {
  id: string;
  role: 'user' | 'agent';
  text: string;
  proposedItems?: { text: string }[];
  itemsAdded?: boolean;
  actions?: ('connect_calendar' | 'connect_zoom')[];
}

interface AssistantChatPanelProps {
  messages: AssistantChatMsg[];
  loading: boolean;
  onAddItems: (msgId: string, items: { text: string }[]) => void;
}

/** Pure message-thread display for the Assistant home view — the actual input
 *  is the shared bottom AgentBar (in "Assistant" mode), routed to chat by
 *  InboxAssistantPanel rather than duplicated here. */
export function AssistantChatPanel({ messages, loading, onAddItems }: AssistantChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleConnectCalendar = async () => {
    setConnectError(null);
    setConnectingCalendar(true);
    try {
      await connectGoogleCalendar(); // redirects the page away on success
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to start calendar connection.');
      setConnectingCalendar(false);
    }
  };

  const handleConnectZoom = () => {
    setConnectError(null);
    try {
      connectZoom(); // redirects the page away
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to start Zoom connection.');
    }
  };

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-3 px-4 py-4">
      {messages.map(msg => (
        <div key={msg.id} className="flex flex-col gap-2">
          <ChatBubble role={msg.role}>{msg.text}</ChatBubble>
          {msg.actions && msg.actions.length > 0 && (
            <div className="ml-9 flex flex-wrap gap-2 max-w-[85%]">
              {msg.actions.includes('connect_calendar') && (
                <button
                  onClick={handleConnectCalendar}
                  disabled={connectingCalendar}
                  className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-60"
                >
                  <Calendar className="h-3.5 w-3.5" />{connectingCalendar ? 'Connecting…' : 'Connect Calendar'}
                </button>
              )}
              {msg.actions.includes('connect_zoom') && (
                <button
                  onClick={handleConnectZoom}
                  className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 bg-gray-900 text-white hover:bg-gray-700 transition-colors"
                >
                  <Video className="h-3.5 w-3.5" />Connect Zoom
                </button>
              )}
            </div>
          )}
          {msg.proposedItems && msg.proposedItems.length > 0 && (
            <div className="ml-9 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2 max-w-[85%]">
              <ul className="space-y-1">
                {msg.proposedItems.map((item, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                    <span className="text-gray-400">•</span>{item.text}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onAddItems(msg.id, msg.proposedItems!)}
                disabled={msg.itemsAdded}
                className={cn(
                  'w-full text-xs font-medium rounded-lg px-3 py-1.5 transition-colors flex items-center justify-center gap-1.5',
                  msg.itemsAdded
                    ? 'bg-emerald-50 text-emerald-600 cursor-default'
                    : 'bg-gray-900 text-white hover:bg-gray-700',
                )}
              >
                {msg.itemsAdded ? <><Check className="h-3.5 w-3.5" />Added to your inbox</> : 'Put these items in my inbox'}
              </button>
            </div>
          )}
        </div>
      ))}
      {connectError && <p className="ml-9 text-xs text-red-500">{connectError}</p>}
      {loading && (
        <div className="flex gap-2 items-center text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-xs">Thinking…</span>
        </div>
      )}
    </div>
  );
}
