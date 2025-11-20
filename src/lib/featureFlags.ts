// Simple feature flag utility
// Enable flags via Vite env vars. Example: VITE_FEATURE_SI_PROGRESS=true
// Optionally allow localStorage overrides for manual testing (e.g. setItem('ff.siProgress','1')).

export const featureFlags = {
  siProgress:
    (typeof localStorage !== 'undefined' && localStorage.getItem('ff.siProgress') === '1') ||
    String((import.meta as any).env?.VITE_FEATURE_SI_PROGRESS || '').toLowerCase() === 'true',
} as const;

export type FeatureFlagKey = keyof typeof featureFlags;

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return !!featureFlags[flag];
}