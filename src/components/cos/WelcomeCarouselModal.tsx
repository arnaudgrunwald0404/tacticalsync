import React, { useCallback, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  LayoutGrid, CalendarCheck, Coffee, Users, ArrowRight, Mail, MessageSquare,
} from 'lucide-react';

interface WelcomeCarouselModalProps {
  open: boolean;
  onClose: () => void;
}

const STEP_COUNT = 4;

export function WelcomeCarouselModal({ open, onClose }: WelcomeCarouselModalProps) {
  if (!open) return null;
  return <WelcomeCarouselInner onClose={onClose} />;
}

function WelcomeCarouselInner({ onClose }: { onClose: () => void }) {
  const isMobile = useIsMobile();
  const [current, setCurrent] = useState(0);

  const goNext = useCallback(() => {
    if (current === STEP_COUNT - 1) {
      onClose();
    } else {
      setCurrent(c => c + 1);
    }
  }, [current, onClose]);

  const steps = [
    <StepWelcome key={0} />,
    <StepMyLists key={1} />,
    <StepDailyCheckin key={2} />,
    <StepOneOnOnes key={3} />,
  ];

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden border-rose-gold/20',
          isMobile ? 'max-w-full h-full rounded-none' : 'sm:max-w-2xl sm:rounded-2xl',
        )}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Welcome to your workspace</DialogTitle>

        <div className="relative overflow-hidden">
          <div
            className="flex transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${current * 100}%)` }}
          >
            {steps.map((step, i) => (
              <div key={i} className="w-full shrink-0">
                {step}
              </div>
            ))}
          </div>
        </div>

        {/* Navigation footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-rose-gold/10 bg-platinum/20">
          <div className="flex gap-1.5">
            {Array.from({ length: STEP_COUNT }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={cn(
                  'h-2 rounded-full transition-all duration-200',
                  i === current ? 'w-6 bg-copper' : 'w-2 bg-titanium/30',
                )}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="text-xs text-titanium hover:text-cast-iron transition-colors underline underline-offset-2"
            >
              Skip
            </button>
            <Button
              onClick={goNext}
              className="bg-copper hover:bg-copper-hover text-white font-body h-9 px-5"
            >
              {current === STEP_COUNT - 1 ? (
                <>Go to My Lists</>
              ) : (
                <>Next <ArrowRight className="h-3.5 w-3.5 ml-1.5" /></>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Step components ──

function StepWelcome() {
  return (
    <StepLayout
      icon={<LayoutGrid className="h-8 w-8 text-copper" />}
      badge="Welcome"
      heading="Your personal command center"
      body="TacticalSync helps you manage your week across three time horizons — from daily tasks to long-term strategy. Here's how the pieces fit together:"
    >
      <div className="mt-4 flex items-center gap-2 sm:gap-3 justify-center">
        <HorizonCard label="My Lists" timeframe="Day – Week" description="Track daily priorities" active />
        <ArrowRight className="h-3.5 w-3.5 text-titanium/40 shrink-0" />
        <HorizonCard label="Commitments" timeframe="Month – Quarter" description="Monthly goals" />
        <ArrowRight className="h-3.5 w-3.5 text-titanium/40 shrink-0" />
        <HorizonCard label="Strategy" timeframe="Six months" description="Team objectives" />
      </div>
      <p className="mt-3 text-[11px] text-titanium/70 max-w-sm text-center leading-snug">
        Plus: AI-powered daily check-ins and 1:1 meeting prep that pull from your calendar, email, and Slack.
      </p>
    </StepLayout>
  );
}

function StepMyLists() {
  return (
    <StepLayout
      icon={<LayoutGrid className="h-8 w-8 text-copper" />}
      badge="My Lists"
      heading="Organize what matters"
      body="Your board has 2–4 columns, each with sections. Here's an example of what a configured board looks like:"
    >
      <PopulatedBoardExample />
      <p className="mt-2 text-[11px] text-titanium/70 text-center">
        We recommend configuring your columns before adding items — you can always change them later.
      </p>
    </StepLayout>
  );
}

function StepDailyCheckin() {
  return (
    <StepLayout
      icon={<Coffee className="h-8 w-8 text-copper" />}
      badge="Daily Check-in"
      heading="Start each day with clarity"
      body="Each morning, load your AI brief — it reviews yesterday's progress and suggests today's focus based on your calendar, email, and Slack."
    >
      <div className="mt-3 grid grid-cols-3 gap-2 max-w-xs">
        <BriefSourcePill icon={<CalendarCheck className="h-3.5 w-3.5" />} label="Calendar" />
        <BriefSourcePill icon={<Mail className="h-3.5 w-3.5" />} label="Email" />
        <BriefSourcePill icon={<MessageSquare className="h-3.5 w-3.5" />} label="Slack" />
      </div>
      <p className="mt-2 text-[11px] text-titanium/70 max-w-sm text-center leading-snug">
        Your brief gets smarter as you connect more integrations in Settings.
      </p>
    </StepLayout>
  );
}

function StepOneOnOnes() {
  return (
    <StepLayout
      icon={<Users className="h-8 w-8 text-copper" />}
      badge="1:1 Meetings"
      heading="Never go into a 1:1 unprepared"
      body="Connect your calendar and we'll auto-detect your 1:1s. Before each meeting, AI generates a prep brief pulling from the tools you use every day."
    >
      <div className="flex flex-wrap gap-2 justify-center mt-3">
        {[
          { tool: 'Google Calendar', note: 'Detect meetings' },
          { tool: 'Gmail', note: 'Recent threads' },
          { tool: 'Slack', note: 'DMs & channels' },
          { tool: 'Jira', note: 'For engineers' },
          { tool: 'ClearGo', note: 'For product' },
        ].map(({ tool, note }) => (
          <span key={tool} className="inline-flex flex-col items-center rounded-lg bg-platinum/60 px-3 py-1.5 text-xs border border-rose-gold/20">
            <span className="font-medium text-cast-iron">{tool}</span>
            <span className="text-[10px] text-titanium">{note}</span>
          </span>
        ))}
      </div>
    </StepLayout>
  );
}

// ── Shared layout ──

function StepLayout({
  icon, badge, heading, body, children, muted,
}: {
  icon: React.ReactNode;
  badge: string;
  heading: string;
  body: string;
  children?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center px-8 py-10 sm:px-12 sm:py-12">
      <div className={cn(
        'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl',
        muted ? 'bg-titanium/10' : 'bg-copper/10',
      )}>
        {icon}
      </div>
      <span className={cn(
        'mb-2 inline-block rounded-full px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
        muted ? 'bg-titanium/10 text-titanium' : 'bg-copper/10 text-copper',
      )}>
        {badge}
      </span>
      <h2 className="font-heading text-xl sm:text-2xl font-bold text-cast-iron mb-2">
        {heading}
      </h2>
      <p className="font-body text-sm text-titanium max-w-md leading-relaxed">
        {body}
      </p>
      {children}
    </div>
  );
}

function HorizonCard({ label, timeframe, description, active }: {
  label: string; timeframe: string; description: string; active?: boolean;
}) {
  return (
    <div className={cn(
      'flex flex-col items-center rounded-lg border px-3 py-2 text-center min-w-[85px]',
      active ? 'border-copper/30 bg-copper/5' : 'border-rose-gold/20 bg-platinum/30',
    )}>
      <span className={cn('text-xs font-semibold', active ? 'text-copper' : 'text-titanium')}>
        {label}
      </span>
      <span className="text-[10px] text-titanium/60">{timeframe}</span>
      <span className="text-[10px] text-titanium mt-0.5">{description}</span>
    </div>
  );
}

function PopulatedBoardExample() {
  const cols = [
    { header: 'This Week', color: 'bg-copper/20', items: [
      { text: 'Ship onboarding flow', badge: 'WIP', badgeColor: 'bg-blue-100 text-blue-700' },
      { text: 'Review Q2 metrics', badge: 'Done', badgeColor: 'bg-green-100 text-green-700' },
    ]},
    { header: 'Strategic', color: 'bg-titanium/20', items: [
      { text: 'Partner integration', badge: 'WOS', badgeColor: 'bg-amber-100 text-amber-700' },
    ]},
    { header: 'Direct Reports', color: 'bg-copper/20', items: [
      { text: 'Alex — career growth', badge: null, badgeColor: '' },
      { text: 'Sam — project handoff', badge: null, badgeColor: '' },
    ]},
  ];
  return (
    <div className="mt-3 flex gap-2 max-w-md">
      {cols.map((col, ci) => (
        <div key={ci} className="flex-1 min-w-0">
          <div className={cn('h-1.5 rounded-full mb-1.5', col.color)} />
          <p className="text-[9px] font-semibold text-titanium/60 uppercase tracking-wider mb-1 truncate">{col.header}</p>
          <div className="space-y-1">
            {col.items.map((item, ii) => (
              <div key={ii} className="rounded border border-rose-gold/30 bg-white px-1.5 py-1 flex items-center gap-1">
                <span className="text-[10px] text-cast-iron truncate flex-1">{item.text}</span>
                {item.badge && (
                  <span className={cn('text-[8px] font-medium px-1 rounded', item.badgeColor)}>{item.badge}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BriefSourcePill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-rose-gold/20 bg-platinum/30 px-2.5 py-1.5">
      <span className="text-copper">{icon}</span>
      <span className="text-xs text-titanium">{label}</span>
    </div>
  );
}
