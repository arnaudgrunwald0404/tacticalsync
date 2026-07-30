import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// supabase/functions/_shared/agentInboxNudges.ts is a hand-kept mirror of
// this file — the Deno edge function can't import from src/, so the logic is
// duplicated on purpose (same convention as matchEventToMember.ts, see
// matchEventToMemberParity.test.ts). Only comments, import specifiers (Deno
// needs an esm.sh URL where the frontend uses a bare package name), and
// semicolon style (deno fmt omits trailing semicolons) are allowed to drift.
// This test fails the moment the actual logic diverges.
function normalize(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments (incl. JSDoc)
    .split('\n')
    .filter((line) => !line.trim().startsWith('import '))
    .map((line) => line.replace(/\/\/.*$/, '')) // line comments
    .map((line) => line.replace(/;\s*$/, '')) // trailing statement semicolons
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join('\n');
}

describe('agentInboxNudges mirror parity', () => {
  it('keeps src/lib/agentInboxNudges.ts and supabase/functions/_shared/agentInboxNudges.ts logically identical', () => {
    const frontendPath = path.resolve(__dirname, '../../lib/agentInboxNudges.ts');
    const edgeFunctionPath = path.resolve(
      __dirname,
      '../../../supabase/functions/_shared/agentInboxNudges.ts',
    );

    const frontendCode = normalize(readFileSync(frontendPath, 'utf-8'));
    const edgeFunctionCode = normalize(readFileSync(edgeFunctionPath, 'utf-8'));

    expect(edgeFunctionCode, [
      'supabase/functions/_shared/agentInboxNudges.ts has drifted from',
      'src/lib/agentInboxNudges.ts beyond comments/imports/semicolons.',
      'The edge function copy must stay logically identical to the copy',
      'Vitest actually exercises — update whichever file is stale.',
    ].join(' ')).toBe(frontendCode);
  });
});
