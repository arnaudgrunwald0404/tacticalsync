import { ExternalLink, Link2, Mail, Slack } from 'lucide-react';
import type { InboxItem } from '@/types/inbox';

interface SourceLink {
  href: string;
  label: string;
  icon: typeof Mail;
}

// Older gmail-sourced items predate agent_payload.gmail_url; source_ref.id is
// the Gmail API message id, which Gmail's web UI resolves directly via #all/,
// so those items still get a working "open the email" link.
function gmailFallbackUrl(messageId: string | undefined): string | null {
  return messageId ? `https://mail.google.com/mail/u/0/#all/${messageId}` : null;
}

/** External links back to an item's source: the original email or Slack
 *  message, plus the action's direct target extracted from the email body
 *  (agent_payload.action_url — e.g. the training the email asks you to take). */
export function getItemSourceLinks(item: InboxItem): SourceLink[] {
  const links: SourceLink[] = [];
  const payload = item.agent_payload;

  if (item.source_ref?.type === 'gmail_message') {
    const href = payload?.gmail_url ?? gmailFallbackUrl(item.source_ref.id);
    if (href) links.push({ href, label: 'Open the original email', icon: Mail });
  } else if (item.source_ref?.type === 'slack_message' && payload?.slack_url) {
    links.push({ href: payload.slack_url, label: 'Open the Slack message', icon: Slack });
  }

  if (payload?.action_url) {
    links.push({ href: payload.action_url, label: payload.action_label || 'Open the linked resource', icon: Link2 });
  }

  return links;
}

/** "Source" sidebar section — rendered by both the desktop detail panel and
 *  the mobile drawer. Renders nothing for items with no external source. */
export function SourceLinksSection({ item }: { item: InboxItem }) {
  const links = getItemSourceLinks(item);
  if (links.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Source</p>
      <ul className="space-y-1">
        {links.map(link => (
          <li key={link.href}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 max-w-full text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              <link.icon className="h-3 w-3 flex-shrink-0" />
              <span className="truncate group-hover:underline">{link.label}</span>
              <ExternalLink className="h-3 w-3 flex-shrink-0 text-gray-400" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
