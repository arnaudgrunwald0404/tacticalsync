// Illustration for the Inbox's default "all clear" empty state — a recorded
// conversation (speech bubble + transcript waves) turning into a tracked,
// checked-off commitment, with the sticky note it replaces fading out above.
// Colors are pulled straight from the brand palette (see design-system/tokens.ts)
// rather than Tailwind grays, since this is a brand moment, not a utility icon.
export function AccountabilityIllustration({ className }: { className?: string }) {
  const titanium = '#4A5D5F';
  const copper = '#FF7A52';
  const pewter = '#9FA8B3';

  return (
    <svg viewBox="0 0 220 140" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Faded sticky note being replaced — crossed out, secondary */}
      <g opacity="0.55" transform="rotate(-12 128 30)">
        <path
          d="M104 12h40v32l-8 8h-32z"
          stroke={pewter}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M136 44l8-8h-8z" stroke={pewter} strokeWidth="3" strokeLinejoin="round" />
        <path d="M108 16l32 32M140 16l-32 32" stroke={pewter} strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* Speech bubble with transcript waves */}
      <path
        d="M18 30h74a10 10 0 0 1 10 10v34a10 10 0 0 1-10 10H46l-16 16v-16h-12a10 10 0 0 1-10-10V40a10 10 0 0 1 10-10Z"
        stroke={titanium}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M28 56c4-5 8-5 12 0s8 5 12 0s8-5 12 0s8 5 12 0"
        stroke={titanium}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M28 70c4-5 8-5 12 0s8 5 12 0s8-5 12 0"
        stroke={titanium}
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Connecting arrow */}
      <path
        d="M40 84c0 14 10 14 22 14h44"
        stroke={copper}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M96 88l10 10-10 10"
        stroke={copper}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Checklist card with checkmark */}
      <rect x="150" y="52" width="52" height="66" rx="9" stroke={titanium} strokeWidth="4" />
      <rect x="163" y="74" width="26" height="26" rx="5" stroke={titanium} strokeWidth="4" />
      <path
        d="M168 87l7 7 13-15"
        stroke={copper}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
