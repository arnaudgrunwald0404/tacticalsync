import { describe, it, expect } from 'vitest';
import { formatHourLabel, isValidTimezone, getBrowserTimezone } from '@/lib/prepScheduleTime';

// ─────────────────────────────────────────────────────────────────
// Pure timezone/time helpers shared by the Prep schedule panel, the
// onboarding wizard, and the dashboard banner. These replaced three
// divergent copies of hour-conversion logic.
// ─────────────────────────────────────────────────────────────────

describe('formatHourLabel', () => {
  it('formats midnight and noon correctly', () => {
    expect(formatHourLabel(0)).toBe('12:00 AM');
    expect(formatHourLabel(12)).toBe('12:00 PM');
  });

  it('formats morning and evening hours', () => {
    expect(formatHourLabel(8)).toBe('8:00 AM');
    expect(formatHourLabel(11)).toBe('11:00 AM');
    expect(formatHourLabel(13)).toBe('1:00 PM');
    expect(formatHourLabel(23)).toBe('11:00 PM');
  });

  it('wraps out-of-range hours into a valid 0-23 label', () => {
    expect(formatHourLabel(24)).toBe('12:00 AM');
    expect(formatHourLabel(-1)).toBe('11:00 PM');
  });
});

describe('isValidTimezone', () => {
  it('accepts valid IANA zones', () => {
    expect(isValidTimezone('America/Los_Angeles')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Europe/Paris')).toBe(true);
  });

  it('rejects invalid or empty zones', () => {
    expect(isValidTimezone('Not/AZone')).toBe(false);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });
});

describe('getBrowserTimezone', () => {
  it('returns a non-empty, valid IANA timezone', () => {
    const tz = getBrowserTimezone();
    expect(tz).toBeTruthy();
    expect(isValidTimezone(tz)).toBe(true);
  });
});
