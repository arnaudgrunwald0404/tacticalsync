/**
 * DESIGN SYSTEM - Main Export
 * ============================
 * 
 * Central export point for all design system tokens and utilities.
 */

export * from './tokens';
export { default } from './tokens';

// Re-export commonly used tokens for convenience
export {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  transitions,
  breakpoints,
  zIndex,
  components,
  layout,
  grid,
} from './tokens';

