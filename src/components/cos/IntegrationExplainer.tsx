import { Sparkles, ShieldCheck } from 'lucide-react';
import type { IntegrationCopy } from '@/lib/integrationCopy';

/**
 * Always-visible "what we do with this / why it matters" block for a Settings
 * integration page. Deliberately not collapsed behind an accordion — the
 * point is transparency, so it should be seen, not hidden.
 */
export default function IntegrationExplainer({ copy }: { copy: IntegrationCopy }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-4">
      <p className="text-sm font-semibold">{copy.name}</p>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          {copy.whatWeDoLabel ?? 'What we do with this'}
        </p>
        <ul className="space-y-1.5">
          {copy.whatWeDo.map((item, i) => (
            <li key={i} className="text-sm text-foreground/90 flex gap-2">
              <span className="text-muted-foreground select-none">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" /> Why it matters
        </p>
        <ul className="space-y-1.5">
          {copy.whyItMatters.map((item, i) => (
            <li key={i} className="text-sm text-foreground/90 flex gap-2">
              <span className="text-muted-foreground select-none">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {copy.boundaries && copy.boundaries.length > 0 && (
        <div className="border-t border-border/60 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" /> What we don't do
          </p>
          <ul className="space-y-1.5">
            {copy.boundaries.map((item, i) => (
              <li key={i} className="text-sm text-foreground/90 flex gap-2">
                <span className="text-muted-foreground select-none">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
