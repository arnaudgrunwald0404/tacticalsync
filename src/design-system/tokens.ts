/**
 * DESIGN SYSTEM TOKENS
 * =====================
 * 
 * Single source of truth for all design tokens used across the application.
 * This file defines colors, typography, spacing, shadows, and other design constants.
 * 
 * Usage:
 * - Import tokens directly: import { colors, spacing } from '@/design-system/tokens'
 * - Use in Tailwind: className="bg-[#C97D60]" or use CSS variables
 * - Use in components: style={{ color: colors.primary.copper }}
 */

// ============================================================================
// COLOR PALETTE - Metal-Themed Brand Colors
// ============================================================================

export const colors = {
  // Primary Colors
  primary: {
    white: {
      hex: '#FFFFFF',
      rgb: '255, 255, 255',
      hsl: '0, 0%, 100%',
      usage: 'Pure base color for backgrounds and negative space',
    },
    platinum: {
      hex: '#F5F3F0',
      rgb: '245, 243, 240',
      hsl: '30, 20%, 95%',
      usage: 'Subtle neutral for secondary backgrounds',
    },
    copper: {
      hex: '#C97D60',
      rgb: '201, 125, 96',
      hsl: '15, 48%, 58%',
      usage: 'Warm accent for highlights and CTAs',
      hover: '#B86A4F',
    },
    titanium: {
      hex: '#4A5D5F',
      rgb: '74, 93, 95',
      hsl: '185, 12%, 33%',
      usage: 'Deep tone for primary text and emphasis',
      hover: '#3A4D4F',
    },
  },

  // Secondary Colors
  secondary: {
    roseGold: {
      hex: '#E8B4A0',
      rgb: '232, 180, 160',
      hsl: '15, 60%, 77%',
      usage: 'Light warm accent',
    },
    bronze: {
      hex: '#8B6F47',
      rgb: '139, 111, 71',
      hsl: '35, 32%, 41%',
      usage: 'Medium-dark accent',
    },
    verdigris: {
      hex: '#6B9A8F',
      rgb: '107, 154, 143',
      hsl: '165, 18%, 51%',
      usage: 'Calm, balanced accent',
      hover: '#5B8A7F',
    },
    steel: {
      hex: '#5B6E7A',
      rgb: '91, 110, 122',
      hsl: '205, 15%, 42%',
      usage: 'Cool, professional accent',
    },
    pewter: {
      hex: '#9FA8B3',
      rgb: '159, 168, 179',
      hsl: '215, 12%, 66%',
      usage: 'Light neutral accent',
    },
    whiteGold: {
      hex: '#F8F6F2',
      rgb: '248, 246, 242',
      hsl: '40, 25%, 96%',
      usage: 'Very light background',
    },
    brass: {
      hex: '#B89A6B',
      rgb: '184, 154, 107',
      hsl: '35, 35%, 57%',
      usage: 'Warm medium accent',
    },
    castIron: {
      hex: '#2C2C2C',
      rgb: '44, 44, 44',
      hsl: '0, 0%, 17%',
      usage: 'Reserved for text and logo only — not for backgrounds or graphic elements',
    },
  },

  // Semantic Colors
  semantic: {
    success: {
      hex: '#6FA87F', // Bright Sage Green - clearly green, brighter and more vibrant
      rgb: '111, 168, 127',
      hsl: '145, 30%, 55%',
      usage: 'Success states, positive feedback, on-track indicators',
    },
    warning: {
      hex: '#B89A6B', // Brass
      rgb: '184, 154, 107',
      hsl: '35, 35%, 57%',
      usage: 'Warning states, caution',
    },
    error: {
      hex: '#A85D5D', // Terracotta Red - clearly red but warm, harmonizes with palette
      rgb: '168, 93, 93',
      hsl: '0, 28%, 51%',
      usage: 'Error states, destructive actions, off-track indicators',
    },
    info: {
      hex: '#5B6E7A', // Steel
      rgb: '91, 110, 122',
      hsl: '205, 15%, 42%',
      usage: 'Informational messages',
    },
  },

  // Neutral Grays (for UI elements)
  neutral: {
    50: { hex: '#FAFAFA', hsl: '0, 0%, 98%' },
    100: { hex: '#F5F5F5', hsl: '0, 0%, 96%' },
    200: { hex: '#E5E5E5', hsl: '0, 0%, 90%' },
    300: { hex: '#D4D4D4', hsl: '0, 0%, 83%' },
    400: { hex: '#A3A3A3', hsl: '0, 0%, 64%' },
    500: { hex: '#737373', hsl: '0, 0%, 45%' },
    600: { hex: '#525252', hsl: '0, 0%, 32%' },
    700: { hex: '#404040', hsl: '0, 0%, 25%' },
    800: { hex: '#262626', hsl: '0, 0%, 15%' },
    900: { hex: '#171717', hsl: '0, 0%, 9%' },
  },
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const typography = {
  // Font Families
  fonts: {
    heading: "'Inter', ui-sans-serif, system-ui, sans-serif",
    body: "'Inter', ui-sans-serif, system-ui, sans-serif",
    mono: "'Fira Code', 'Courier New', monospace",
  },

  // Font Sizes (rem)
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',    // 18px
    xl: '1.25rem',     // 20px
    '2xl': '1.5rem',   // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
    '5xl': '3rem',     // 48px
    '6xl': '3.75rem',  // 60px
  },

  // Font Weights
  fontWeight: {
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },

  // Line Heights
  lineHeight: {
    none: '1',
    tight: '1.25',
    snug: '1.375',
    normal: '1.5',
    relaxed: '1.625',
    loose: '2',
  },

  // Letter Spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

// ============================================================================
// SPACING SCALE
// ============================================================================

export const spacing = {
  // Base spacing unit: 4px (0.25rem)
  0: '0',
  1: '0.25rem',   // 4px
  2: '0.5rem',    // 8px
  3: '0.75rem',   // 12px
  4: '1rem',      // 16px
  5: '1.25rem',   // 20px
  6: '1.5rem',    // 24px
  8: '2rem',      // 32px
  10: '2.5rem',   // 40px
  12: '3rem',     // 48px
  16: '4rem',     // 64px
  20: '5rem',     // 80px
  24: '6rem',     // 96px
  32: '8rem',     // 128px
  40: '10rem',    // 160px
  48: '12rem',    // 192px
  64: '16rem',    // 256px
} as const;

// ============================================================================
// BORDER RADIUS
// ============================================================================

export const borderRadius = {
  none: '0',
  sm: '0.125rem',   // 2px
  base: '0.25rem',   // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  '3xl': '1.5rem',  // 24px
  full: '9999px',
} as const;

// ============================================================================
// SHADOWS
// ============================================================================

export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
} as const;

// ============================================================================
// TRANSITIONS & ANIMATIONS
// ============================================================================

export const transitions = {
  duration: {
    fast: '150ms',
    base: '200ms',
    slow: '300ms',
    slower: '500ms',
  },
  easing: {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  default: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// ============================================================================
// BREAKPOINTS
// ============================================================================

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ============================================================================
// Z-INDEX SCALE
// ============================================================================

export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
} as const;

// ============================================================================
// COMPONENT SPECIFICATIONS
// ============================================================================

export const components = {
  // Button
  button: {
    height: {
      sm: '2.25rem',   // 36px
      md: '2.5rem',    // 40px
      lg: '2.75rem',   // 44px
    },
    padding: {
      sm: '0.5rem 0.75rem',
      md: '0.5rem 1rem',
      lg: '0.625rem 2rem',
    },
    borderRadius: borderRadius.lg,
  },

  // Input
  input: {
    height: {
      sm: '2.25rem',
      md: '2.5rem',
      lg: '2.75rem',
    },
    padding: {
      sm: '0.5rem 0.75rem',
      md: '0.5rem 0.75rem',
      lg: '0.625rem 0.75rem',
    },
    borderRadius: borderRadius.md,
  },

  // Card
  card: {
    padding: {
      sm: '1rem',
      md: '1.5rem',
      lg: '2rem',
    },
    borderRadius: borderRadius.xl,
    borderWidth: '1px',
  },

  // Badge
  badge: {
    padding: {
      sm: '0.125rem 0.5rem',
      md: '0.25rem 0.75rem',
    },
    borderRadius: borderRadius.full,
    fontSize: typography.fontSize.xs,
  },

  // Navigation Tabs
  tabs: {
    height: '2.5rem',
    padding: '0.5rem 1rem',
    borderRadius: borderRadius.lg,
    activeBorderBottom: '2px',
  },
} as const;

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

export const layout = {
  // Container
  container: {
    maxWidth: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1400px',
    },
    padding: {
      mobile: '1rem',
      tablet: '1.5rem',
      desktop: '2rem',
    },
  },

  // Sidebar
  sidebar: {
    width: {
      collapsed: '4rem',
      expanded: '16rem',
    },
  },

  // Header (Top Bar)
  header: {
    height: {
      mobile: '3.5rem', // 56px
      desktop: '4rem', // 64px
    },
    padding: {
      mobile: '0.75rem', // py-3, 12px
      desktop: '1rem', // py-4, 16px
    },
    zIndex: 50,
    background: 'white',
    border: '1px solid hsl(var(--border))',
    structure: {
      left: {
        gap: '1rem', // gap-4
        logoScale: {
          mobile: '0.75', // scale-75
          desktop: '1', // scale-100
        },
      },
      center: {
        position: 'absolute',
        transform: 'left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2',
      },
      right: {
        paddingRight: '5rem', // pr-20 - space for user profile
      },
    },
  },

  // Sidebars
  sidebars: {
    left: {
      width: {
        default: '16rem', // 256px, w-64
        collapsed: '4rem', // 64px
        expanded: '20rem', // 320px
        navigation: '308px', // Default for hierarchical nav
        min: '200px',
        max: '600px',
      },
      background: '#F5F3F0', // Platinum
      border: 'rgba(232, 180, 160, 0.3)', // Rose Gold / 30%
      padding: '1rem', // p-4
      minHeight: 'calc(100vh - 73px)', // Accounts for header
    },
    right: {
      width: {
        default: '360px',
        narrow: '280px',
        wide: '440px',
      },
      background: 'white',
      border: 'hsl(var(--sidebar-border))',
      padding: '0.75rem', // p-3
      position: {
        top: '73px', // Below header
        zIndex: 10,
      },
    },
    mobile: {
      sheetWidth: '20rem', // 320px, w-80
      overlay: 'rgba(0, 0, 0, 0.5)',
    },
  },
} as const;

// ============================================================================
// GRID SYSTEM
// ============================================================================

export const grid = {
  columns: {
    mobile: 4,
    tablet: 8,
    desktop: 12,
    wide: 24,
  },
  gap: {
    sm: spacing[2],
    md: spacing[4],
    lg: spacing[6],
    xl: spacing[8],
  },
} as const;

// ============================================================================
// EXPORT ALL TOKENS
// ============================================================================

export const designTokens = {
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
} as const;

export default designTokens;

