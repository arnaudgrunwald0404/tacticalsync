import type { ReactNode } from 'react';
import { Bot } from 'lucide-react';

interface ChatBubbleProps {
  role: 'user' | 'agent';
  children: ReactNode;
}

/** A single chat message bubble — shared between MeetingChatPanel, AssistantChatPanel,
 *  and DelegationChatView so all three read as the same conversation surface. */
export function ChatBubble({ role, children }: ChatBubbleProps) {
  if (role === 'agent') {
    return (
      <div className="flex gap-2.5 items-start max-w-[90%]">
        <span className="w-7 h-7 flex-shrink-0 rounded-lg bg-gray-100 grid place-items-center mt-0.5">
          <Bot className="h-3.5 w-3.5 text-gray-500" />
        </span>
        <div className="bg-white border border-gray-200 rounded-[4px_12px_12px_12px] px-3 py-2.5 text-sm leading-relaxed whitespace-pre-line text-gray-800">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="self-end max-w-[80%] bg-blue-600 text-white rounded-[12px_4px_12px_12px] px-3 py-2.5 text-sm leading-relaxed">
      {children}
    </div>
  );
}
