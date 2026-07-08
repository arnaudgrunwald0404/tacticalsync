import { Info, Sparkles, ShieldCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { IntegrationCopy } from '@/lib/integrationCopy';

/**
 * Compact "ⓘ" affordance for the onboarding wizard's tight per-integration
 * rows — same copy as IntegrationExplainer, just progressively disclosed
 * since there's no room for an always-open block in a one-line row.
 */
export default function IntegrationInfoPopover({ copy }: { copy: IntegrationCopy }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What we do with ${copy.name}`}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            What we do with this
          </p>
          <ul className="space-y-1">
            {copy.whatWeDo.map((item, i) => (
              <li key={i} className="text-xs text-foreground/90 flex gap-1.5">
                <span className="text-muted-foreground select-none">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Why it matters
          </p>
          <ul className="space-y-1">
            {copy.whyItMatters.map((item, i) => (
              <li key={i} className="text-xs text-foreground/90 flex gap-1.5">
                <span className="text-muted-foreground select-none">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        {copy.boundaries && copy.boundaries.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3" /> What this doesn't do
            </p>
            <ul className="space-y-1">
              {copy.boundaries.map((item, i) => (
                <li key={i} className="text-xs text-foreground/90 flex gap-1.5">
                  <span className="text-muted-foreground select-none">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
