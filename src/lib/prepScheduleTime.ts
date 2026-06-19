// Pure time/timezone helpers for the prep schedule. Kept dependency-free (no
// Supabase client import) so they're shared by the panel, wizard, and banner —
// and unit-testable without environment setup. Re-exported from
// usePrepScheduleConfig for ergonomic importing alongside the hook.

/** The browser's IANA timezone, e.g. "America/Los_Angeles". */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** True if `tz` is a valid IANA timezone name. */
export function isValidTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Human label for an hour-of-day, e.g. 8 → "8:00 AM", 13 → "1:00 PM". */
export function formatHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return '12:00 AM';
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return '12:00 PM';
  return `${h - 12}:00 PM`;
}
