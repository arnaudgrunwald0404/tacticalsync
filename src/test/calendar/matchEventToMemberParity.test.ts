import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// supabase/functions/_shared/matchEventToMember.ts is a hand-kept mirror of
// this file — the Deno edge function can't import from src/, so the logic is
// duplicated on purpose. Only comments are allowed to drift between the two;
// this test fails the moment the actual code diverges, since a passing
// Vitest suite against src/lib/calendar/matchEventToMember.ts would otherwise
// say nothing about what the deployed edge function actually does.
function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trimEnd())
    .filter((line) => line.trim().length > 0)
    .join('\n');
}

describe('matchEventToMember mirror parity', () => {
  it('keeps src/lib/calendar/matchEventToMember.ts and supabase/functions/_shared/matchEventToMember.ts logically identical', () => {
    const frontendPath = path.resolve(__dirname, '../../lib/calendar/matchEventToMember.ts');
    const edgeFunctionPath = path.resolve(
      __dirname,
      '../../../supabase/functions/_shared/matchEventToMember.ts',
    );

    const frontendCode = stripComments(readFileSync(frontendPath, 'utf-8'));
    const edgeFunctionCode = stripComments(readFileSync(edgeFunctionPath, 'utf-8'));

    expect(edgeFunctionCode, [
      'supabase/functions/_shared/matchEventToMember.ts has drifted from',
      'src/lib/calendar/matchEventToMember.ts beyond comments.',
      'The edge function copy must stay logically identical to the copy',
      'Vitest actually exercises — update whichever file is stale.',
    ].join(' ')).toBe(frontendCode);
  });
});
