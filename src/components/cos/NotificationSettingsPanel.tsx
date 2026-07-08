import React from 'react';
import { Loader2, Bell, FileText, AlertTriangle, BarChart3, ListChecks, Sun, Slack, ArrowRight, Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';

interface NotificationSettingsPanelProps {
  className?: string;
  /** Allows the panel to jump the user to another Settings section (e.g. Slack). */
  onNavigateToSection?: (section: string) => void;
}

export function NotificationSettingsPanel({ className, onNavigateToSection }: NotificationSettingsPanelProps) {
  const { prefs, loading, slackConnected, slackEmail, update } = useNotificationPreferences();

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-8', className)}>
      {/* ── Slack delivery status ──────────────────────────────────────── */}
      <SettingsGroup
        title="Delivery"
        description="Notifications below are sent to you as Slack DMs."
      >
        <div className={cn(
          'flex items-center justify-between px-4 py-3 rounded-lg border',
          slackConnected
            ? 'border-border bg-background'
            : 'border-amber-200 bg-amber-50/50',
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'h-8 w-8 rounded-md flex items-center justify-center',
              slackConnected ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600',
            )}>
              <Slack className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Slack</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px] h-4 px-1.5',
                    slackConnected
                      ? 'border-emerald-200 text-emerald-700'
                      : 'border-amber-300 text-amber-700',
                  )}
                >
                  {slackConnected
                    ? `Connected${slackEmail ? ` as ${slackEmail}` : ''}`
                    : 'Required'}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {slackConnected
                  ? 'Toggle each notification type below on or off.'
                  : 'Connect Slack to receive any of the notifications below.'}
              </p>
            </div>
          </div>
          {!slackConnected && (
            <Button
              size="sm"
              variant="outline"
              className="flex-shrink-0 gap-1.5"
              onClick={() => onNavigateToSection?.('slack-sync')}
            >
              Connect Slack
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </SettingsGroup>

      {/* ── Per-type toggles ───────────────────────────────────────────── */}
      <SettingsGroup
        title="What you get notified about"
        description="Each notification is sent independently — turn off the ones you don't need."
      >
        <NotificationToggle
          icon={Bell}
          label="Overdue action nudges"
          description="A Slack DM when action items approach or pass their due date"
          checked={prefs.overdue_action_nudges}
          disabled={!slackConnected}
          onChange={overdue_action_nudges => update({ overdue_action_nudges })}
        />

        <NotificationToggle
          icon={FileText}
          label="Prep ready alerts"
          description="A Slack DM when the Agent finishes pre-staging your 1:1 prep"
          checked={prefs.prep_ready}
          disabled={!slackConnected}
          onChange={prep_ready => update({ prep_ready })}
        />

        <NotificationToggle
          icon={AlertTriangle}
          label="Escalation alerts"
          description="A Slack DM when the Agent flags a pattern like chronic overdue items or stalled topics"
          checked={prefs.escalation_alerts}
          disabled={!slackConnected}
          onChange={escalation_alerts => update({ escalation_alerts })}
        />

        <NotificationToggle
          icon={BarChart3}
          label="Meeting format suggestions"
          description="A Slack DM suggesting a meeting format (quick sync, standard, extended) based on agenda density"
          checked={prefs.format_suggestions}
          disabled={!slackConnected}
          onChange={format_suggestions => update({ format_suggestions })}
        />

        <NotificationToggle
          icon={ListChecks}
          label="Post-meeting follow-ups"
          description="A Slack DM when action items are extracted from a recent meeting's transcript"
          checked={prefs.meeting_followups}
          disabled={!slackConnected}
          onChange={meeting_followups => update({ meeting_followups })}
        />

        <NotificationToggle
          icon={Inbox}
          label="Inbox item nudges"
          description="A Slack DM before a 1:1 with open items tagged to that person, or when a fixed-due-date item is approaching"
          checked={prefs.inbox_item_nudges}
          disabled={!slackConnected}
          onChange={inbox_item_nudges => update({ inbox_item_nudges })}
        />

        <NotificationToggle
          icon={Sun}
          label="Daily Brief"
          description="Your Daily Brief delivered as a Slack DM each morning"
          checked={prefs.daily_brief}
          disabled={!slackConnected}
          onChange={daily_brief => update({ daily_brief })}
        />
      </SettingsGroup>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {description && (
          <p className="text-[11px] text-muted-foreground/80 mt-1">{description}</p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function NotificationToggle({
  icon: Icon,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-md border border-border bg-background">
      <div className="flex items-start gap-2.5">
        <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}
