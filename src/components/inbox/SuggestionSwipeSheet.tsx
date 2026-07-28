import { useState, useCallback } from 'react';
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion';
import { Drawer as DrawerPrimitive } from 'vaul';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SwipeItem {
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  icon?: React.ReactNode;
  recommendedLabel: string;     // "Add to Project X" or "Add to inbox"
  recommendedColor?: string;    // hex for dot on the accept button
  onAccept: () => void;
  onDismiss: () => void;
  /** Renders the "Add to…" destination picker trigger — optional override.
   *  onPickerSelect is called once a tag is chosen; the card will fly away. */
  renderPickerTrigger?: (onPickerSelect: () => void) => React.ReactNode;
}

const SWIPE_THRESHOLD = 80;

function SwipeCard({
  item,
  onAccept,
  onDismiss,
}: {
  item: SwipeItem;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-160, 160], [-15, 15], { clamp: false });
  const acceptOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1], { clamp: true });
  const skipOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0], { clamp: true });

  const flyOut = useCallback(
    (direction: 'accept' | 'dismiss') => {
      animate(x, direction === 'accept' ? 620 : -620, {
        duration: 0.25,
        ease: 'easeOut',
      }).then(() => {
        if (direction === 'accept') onAccept();
        else onDismiss();
      });
    },
    [x, onAccept, onDismiss]
  );

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      style={{ x, rotate, touchAction: 'none' }}
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, transition: { duration: 0.18 } }}
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE_THRESHOLD) flyOut('accept');
        else if (info.offset.x < -SWIPE_THRESHOLD) flyOut('dismiss');
        else animate(x, 0, { type: 'spring', stiffness: 480, damping: 34 });
      }}
    >
      <div className="relative h-full overflow-hidden rounded-2xl border border-white/20 bg-white/10">
        {/* Accept overlay — swipe right */}
        <motion.div
          style={{ opacity: acceptOpacity }}
          className="absolute inset-0 flex items-center justify-start rounded-2xl bg-emerald-500/25 px-5"
        >
          <div className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white shadow">
            <Check className="h-4 w-4" />
            {item.recommendedLabel}
          </div>
        </motion.div>

        {/* Skip overlay — swipe left */}
        <motion.div
          style={{ opacity: skipOpacity }}
          className="absolute inset-0 flex items-center justify-end rounded-2xl bg-rose-500/25 px-5"
        >
          <div className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3 py-1.5 text-sm font-semibold text-white shadow">
            <X className="h-4 w-4" />
            Skip
          </div>
        </motion.div>

        {/* Card content */}
        <div className="relative z-10 flex h-full flex-col p-5">
          {/* Item info */}
          <div className="flex items-start gap-3">
            {item.icon && <div className="mt-0.5 shrink-0">{item.icon}</div>}
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold leading-snug text-white">{item.title}</p>
              <p className="mt-1 text-sm text-white/60">{item.subtitle}</p>
            </div>
          </div>

          {item.badge && (
            <span className="mt-3 self-start rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-xs text-white/70">
              {item.badge}
            </span>
          )}

          {/* Action buttons — stopPropagation so taps don't register as drag starts */}
          <div
            className="mt-auto flex items-center gap-2 pt-4"
            onPointerDown={e => e.stopPropagation()}
          >
            <Button
              size="sm"
              onClick={() => flyOut('accept')}
              className="h-9 flex-1 shrink-0 gap-1.5 border-0 bg-white/20 px-3 text-sm text-white hover:bg-white/30"
            >
              {item.recommendedColor && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.recommendedColor }}
                />
              )}
              <span className="truncate">{item.recommendedLabel}</span>
            </Button>

            {item.renderPickerTrigger?.(() => flyOut('accept'))}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => flyOut('dismiss')}
              className="h-9 shrink-0 px-2.5 text-white/50 hover:bg-white/10 hover:text-white"
              aria-label="Skip"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface Props {
  items: SwipeItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SuggestionSwipeSheet({ items, open, onOpenChange }: Props) {
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  const pending = items.filter(i => !processedIds.has(i.id));
  const doneCount = items.length - pending.length;
  const current = pending[0];

  const handle = useCallback(
    (id: string, action: 'accept' | 'dismiss') => {
      const item = items.find(i => i.id === id);
      if (!item) return;
      setProcessedIds(prev => new Set([...prev, id]));
      if (action === 'accept') item.onAccept();
      else item.onDismiss();
    },
    [items]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setProcessedIds(new Set());
      onOpenChange(next);
    },
    [onOpenChange]
  );

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <DrawerPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-0 outline-none"
          style={{
            background: 'linear-gradient(160deg, #042a55 0%, #0a3f7a 55%, #0760c6 130%)',
            maxHeight: '92dvh',
          }}
        >
          <DrawerPrimitive.Title className="sr-only">Review suggestions</DrawerPrimitive.Title>
          {/* Drag handle */}
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/25" />

          <div className="flex flex-col gap-4 px-4 pb-10 pt-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">
                {pending.length > 0
                  ? `${pending.length} suggestion${pending.length > 1 ? 's' : ''} to review`
                  : 'All done!'}
              </span>

              {/* Progress dots */}
              {items.length > 1 && (
                <div className="flex items-center gap-1">
                  {items.map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'rounded-full transition-all duration-300',
                        i < doneCount
                          ? 'h-1.5 w-1.5 bg-white/25'
                          : i === doneCount
                          ? 'h-2 w-4 bg-white'
                          : 'h-1.5 w-1.5 bg-white/40'
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            {pending.length === 0 ? (
              /* All done state */
              <div className="flex flex-col items-center gap-3 py-10">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20">
                  <Check className="h-7 w-7 text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-white">All suggestions reviewed</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                  className="mt-1 border-white/20 text-white/80 hover:bg-white/10 hover:text-white"
                >
                  Close
                </Button>
              </div>
            ) : (
              <>
                <p className="text-center text-xs text-white/40">
                  Swipe right to add · Swipe left to skip
                </p>

                {/* Card stack */}
                <div className="relative" style={{ height: 248 }}>
                  {/* Ghost cards behind */}
                  {pending.slice(1, 3).map((item, i) => (
                    <motion.div
                      key={item.id}
                      animate={{
                        scale: 1 - (i + 1) * 0.05,
                        y: (i + 1) * 8,
                      }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-x-0 h-full rounded-2xl border border-white/15 bg-white/8"
                      style={{ zIndex: 10 - (i + 1) }}
                    />
                  ))}

                  {/* Active swipeable card */}
                  <AnimatePresence mode="wait">
                    {current && (
                      <SwipeCard
                        key={current.id}
                        item={current}
                        onAccept={() => handle(current.id, 'accept')}
                        onDismiss={() => handle(current.id, 'dismiss')}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
