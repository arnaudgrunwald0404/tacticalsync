# Design System

This directory contains the single source of truth for all design tokens, utilities, and design system documentation.

## Structure

```
design-system/
├── tokens.ts       # All design tokens (colors, typography, spacing, etc.)
├── utils.ts        # Helper functions for working with tokens
├── index.ts        # Main export file
└── README.md       # This file
```

## Quick Start

```typescript
// Import all tokens
import { designTokens } from '@/design-system';

// Import specific tokens
import { colors, spacing, typography } from '@/design-system/tokens';

// Import utilities
import { getColor, getSpacing, getTailwindColor } from '@/design-system/utils';
```

## Usage Examples

### Colors

```typescript
import { colors } from '@/design-system/tokens';

// Get color values
const primaryColor = colors.primary.copper.hex; // '#C97D60'
const hoverColor = colors.primary.copper.hover; // '#B86A4F'

// Use in inline styles
<div style={{ backgroundColor: colors.primary.copper.hex }}>
  Content
</div>

// Use with Tailwind
<div className="bg-[#C97D60] text-white">
  Content
</div>
```

### Spacing

```typescript
import { spacing } from '@/design-system/tokens';

// Get spacing value
const baseSpacing = spacing[4]; // '1rem'

// Use in inline styles
<div style={{ padding: spacing[4] }}>
  Content
</div>

// Use with Tailwind (recommended)
<div className="p-4">
  Content
</div>
```

### Typography

```typescript
import { typography } from '@/design-system/tokens';

// Get font family
const headingFont = typography.fonts.heading;

// Get font size
const largeText = typography.fontSize.lg; // '1.125rem'

// Use in components
<h1 className="font-heading text-4xl font-bold">
  Heading
</h1>
```

### Utilities

```typescript
import { getColor, getTailwindColor, spacingClasses } from '@/design-system/utils';

// Get color by path
const color = getColor('primary.copper.hex');

// Generate Tailwind class
const bgClass = getTailwindColor('primary', 'copper', 'bg');

// Generate spacing classes
const padding = spacingClasses({ all: 4 }); // 'p-4'
const customPadding = spacingClasses({ 
  vertical: 6, 
  horizontal: 4 
}); // 'py-6 px-4'
```

## CSS Variables

All tokens are also available as CSS variables in `src/index.css`:

```css
/* Colors */
--color-copper
--color-titanium
--color-verdigris
/* ... */

/* Typography */
--font-heading
--font-body

/* Spacing, shadows, etc. */
--radius
--shadow-md
```

## Documentation

For complete documentation, see:
- [DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md) - Full design system documentation
- [LAYOUT_PATTERNS.md](./LAYOUT_PATTERNS.md) - Header and sidebar layout patterns
- [Color Palette Showcase](../../src/pages/ColorPaletteShowcase.tsx) - Visual examples

## Best Practices

1. **Always use tokens** - Don't hardcode values
2. **Use Tailwind classes** when possible - Better performance
3. **Use CSS variables** for dynamic theming
4. **Use TypeScript tokens** for type safety
5. **Follow spacing scale** - Use multiples of 4px
6. **Use semantic colors** - Success, warning, error, info

## Contributing

When adding new tokens:
1. Add to `tokens.ts`
2. Add CSS variable to `src/index.css`
3. Update `DESIGN_SYSTEM.md` documentation
4. Add examples to Color Palette Showcase if applicable

