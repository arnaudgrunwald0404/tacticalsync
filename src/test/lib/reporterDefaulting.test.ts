import { describe, it, expect } from 'vitest';
import { ensureCurrentUserProfile, type ReporterProfile } from '@/lib/reporterDefaulting';

// Regression coverage for 15030cb: the check-in reporter select used to
// default to the current user only if their profiles row already existed
// by render time. For a brand-new account, or one excluded by RLS, or just
// a slow profiles load, the reporter select rendered blank. The current
// user must always be injected as a selectable option, falling back to
// their auth metadata/email when no profiles row is found.
//
// (Note: this is tested against the extracted pure function rather than by
// rendering CheckInDialog, because Radix Select's hidden native "bubble
// input" remounts and re-dispatches a stale onValueChange whenever the
// visible SelectItem count changes — a jsdom/React effect-timing quirk,
// already a known limitation elsewhere in this test suite, see the
// Radix-Select skips in SIPanelContent.test.tsx — which corrupts controlled
// Select state during this exact 0-to-N-options transition regardless of
// the actual reporter-defaulting logic under test.)

const existingProfile: ReporterProfile = {
  id: 'user-existing',
  full_name: 'Existing Person',
  first_name: 'Existing',
  last_name: 'Person',
  avatar_url: null,
  avatar_name: null,
};

describe('ensureCurrentUserProfile', () => {
  it('injects a synthetic profile from user_metadata.full_name when no row exists', () => {
    const result = ensureCurrentUserProfile([existingProfile], {
      id: 'user-new',
      email: 'new.hire@example.com',
      user_metadata: { full_name: 'New Hire' },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'user-new', full_name: 'New Hire' });
  });

  it('falls back to email when metadata has no name fields', () => {
    const result = ensureCurrentUserProfile([], {
      id: 'user-new',
      email: 'new.hire@example.com',
      user_metadata: {},
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'user-new', full_name: 'new.hire@example.com', first_name: null, last_name: null });
  });

  it('falls back to email when user_metadata is null', () => {
    const result = ensureCurrentUserProfile([], {
      id: 'user-new',
      email: 'new.hire@example.com',
      user_metadata: null,
    });

    expect(result[0].full_name).toBe('new.hire@example.com');
  });

  it('uses first_name/last_name from metadata when present', () => {
    const result = ensureCurrentUserProfile([], {
      id: 'user-new',
      email: 'new.hire@example.com',
      user_metadata: { first_name: 'New', last_name: 'Hire' },
    });

    expect(result[0]).toMatchObject({ first_name: 'New', last_name: 'Hire' });
  });

  it('does not duplicate the current user when their profiles row already exists', () => {
    const result = ensureCurrentUserProfile(
      [existingProfile],
      { id: 'user-existing', email: 'existing@example.com', user_metadata: {} }
    );

    expect(result).toEqual([existingProfile]);
    expect(result.filter((p) => p.id === 'user-existing')).toHaveLength(1);
  });

  it('returns profiles unchanged when there is no user (e.g. auth not yet resolved)', () => {
    const result = ensureCurrentUserProfile([existingProfile], null);
    expect(result).toEqual([existingProfile]);
  });

  it('places the injected user first in the list', () => {
    const result = ensureCurrentUserProfile([existingProfile], {
      id: 'user-new',
      email: 'new.hire@example.com',
      user_metadata: {},
    });

    expect(result[0].id).toBe('user-new');
    expect(result[1].id).toBe('user-existing');
  });
});
