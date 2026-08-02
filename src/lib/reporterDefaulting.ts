// Pure logic for ensuring the logged-in user always appears as a
// selectable check-in reporter, extracted out of CheckInDialog so it is
// unit-testable independent of Radix Select/React rendering.
//
// Regression coverage for 15030cb: the reporter select used to default to
// the current user only if their `profiles` row already existed by render
// time. For a brand-new account, or one excluded by RLS, or just a slow
// profiles load, the reporter select rendered blank. The current user must
// always be injected as a selectable option, falling back to their auth
// metadata/email when no profiles row is found.

export interface ReporterProfile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  avatar_name: string | null;
}

export interface ReporterAuthUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/**
 * Returns `profiles` with the current user included, injecting a synthetic
 * profile derived from their auth metadata/email when no matching row is
 * present. Returns `profiles` unchanged if there is no user, or if the user
 * already has a row.
 */
export function ensureCurrentUserProfile(
  profiles: ReporterProfile[],
  user: ReporterAuthUser | null
): ReporterProfile[] {
  if (!user) return profiles;
  if (profiles.some((p) => p.id === user.id)) return profiles;

  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const metaFullName = typeof meta.full_name === 'string' ? meta.full_name : undefined;
  const metaFirstName = typeof meta.first_name === 'string' ? meta.first_name : undefined;
  const metaLastName = typeof meta.last_name === 'string' ? meta.last_name : undefined;
  const metaAvatarUrl = typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined;

  return [
    {
      id: user.id,
      full_name: metaFullName || user.email || null,
      first_name: metaFirstName || null,
      last_name: metaLastName || null,
      avatar_url: metaAvatarUrl || null,
      avatar_name: null,
    },
    ...profiles,
  ];
}
