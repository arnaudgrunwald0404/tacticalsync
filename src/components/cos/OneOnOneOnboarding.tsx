import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CalendarCheck, Mail, MessageSquare, ArrowRight, Wrench, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OneOnOneOnboardingProps {
  onConnectCalendar: () => void;
  calendarJustConnected: boolean;
  onDismiss: () => void;
}

export function OneOnOneOnboarding({
  onConnectCalendar,
  calendarJustConnected,
  onDismiss,
}: OneOnOneOnboardingProps) {
  if (calendarJustConnected) {
    return <PostConnectExplainer onDismiss={onDismiss} />;
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24 px-4">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-copper/10">
        <CalendarCheck className="h-9 w-9 text-copper" />
      </div>

      <h3 className="font-heading text-xl sm:text-2xl font-bold text-cast-iron mb-2 text-center">
        Never go into a 1:1 unprepared
      </h3>
      <p className="font-body text-sm sm:text-base text-titanium max-w-lg text-center mb-8 leading-relaxed">
        Connect your calendar and we'll automatically detect your 1:1 meetings.
        Before each one, AI generates a prep brief so you walk in ready.
      </p>

      {/* 3-step visual flow */}
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-2 mb-10 max-w-xl w-full">
        <FlowStep
          number={1}
          icon={<CalendarCheck className="h-5 w-5" />}
          title="Sync calendar"
          description="We detect your 1:1s automatically"
          tone="active"
        />
        <ArrowRight className="hidden sm:block h-4 w-4 text-titanium/40 shrink-0" />
        <FlowStep
          number={2}
          icon={<Mail className="h-5 w-5" />}
          title="AI gathers context"
          description="From email, Slack, and your tools"
          tone="muted"
        />
        <ArrowRight className="hidden sm:block h-4 w-4 text-titanium/40 shrink-0" />
        <FlowStep
          number={3}
          icon={<MessageSquare className="h-5 w-5" />}
          title="Review your prep"
          description="Ready before every meeting"
          tone="muted"
        />
      </div>

      <Button
        onClick={onConnectCalendar}
        className="bg-copper hover:bg-copper-hover text-white font-body h-11 px-8 text-base"
      >
        <CalendarCheck className="h-4.5 w-4.5 mr-2" />
        Connect Google Calendar
      </Button>
      <p className="mt-3 text-xs text-titanium">
        You can always set this up later in Settings
      </p>
    </div>
  );
}

function FlowStep({
  number, icon, title, description, tone,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  tone: 'active' | 'muted';
}) {
  return (
    <div className={cn(
      'flex-1 rounded-xl border p-4 text-center',
      tone === 'active'
        ? 'border-copper/30 bg-copper/5'
        : 'border-rose-gold/20 bg-platinum/30',
    )}>
      <div className={cn(
        'mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full',
        tone === 'active' ? 'bg-copper/15 text-copper' : 'bg-titanium/10 text-titanium',
      )}>
        {icon}
      </div>
      <p className={cn(
        'text-sm font-semibold mb-0.5',
        tone === 'active' ? 'text-cast-iron' : 'text-titanium',
      )}>{title}</p>
      <p className="text-xs text-titanium leading-snug">{description}</p>
    </div>
  );
}

function PostConnectExplainer({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24 px-4">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100">
        <CheckCircle2 className="h-9 w-9 text-green-600" />
      </div>

      <h3 className="font-heading text-xl sm:text-2xl font-bold text-cast-iron mb-2 text-center">
        Calendar connected
      </h3>
      <p className="font-body text-sm sm:text-base text-titanium max-w-lg text-center mb-8 leading-relaxed">
        Your 1:1 meetings will appear here automatically. Before each one, we'll prepare a brief from multiple sources:
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md w-full mb-8">
        <SourceCard icon={<Mail className="h-4 w-4" />} label="Email threads" description="Recent conversations with that person" />
        <SourceCard icon={<MessageSquare className="h-4 w-4" />} label="Slack messages" description="DMs and shared channels" />
        <SourceCard icon={<Wrench className="h-4 w-4" />} label="Function tools" description="Jira, ClearGo, and more" />
        <SourceCard icon={<CalendarCheck className="h-4 w-4" />} label="Past meetings" description="Notes and action items" />
      </div>

      <p className="font-body text-xs text-titanium max-w-sm text-center mb-6 leading-relaxed">
        You can add function-specific integrations in Settings — Jira for engineers, ClearGo for product managers, and other tools for your role.
      </p>

      <Button
        onClick={onDismiss}
        className="bg-copper hover:bg-copper-hover text-white font-body h-10 px-6"
      >
        Got it
      </Button>
    </div>
  );
}

function SourceCard({ icon, label, description }: { icon: React.ReactNode; label: string; description: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-rose-gold/20 bg-platinum/30 p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-copper/10 text-copper shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-cast-iron">{label}</p>
        <p className="text-xs text-titanium">{description}</p>
      </div>
    </div>
  );
}
