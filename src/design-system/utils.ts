/**
 * DESIGN SYSTEM UTILITIES
 * =======================
 * 
 * Helper functions and utilities for working with design tokens.
 */

import { colors, spacing, typography, borderRadius, shadows } from './tokens';

/**
 * Get a color value by path
 * @example getColor('primary.copper.hex') => '#C97D60'
 */
export function getColor(path: string): string {
  const parts = path.split('.');
  let value: any = colors;
  
  for (const part of parts) {
    value = value[part];
    if (value === undefined) {
      console.warn(`Color path "${path}" not found`);
      return '#000000';
    }
  }
  
  return value;
}

/**
 * Get spacing value
 * @example getSpacing(4) => '1rem'
 */
export function getSpacing(multiplier: keyof typeof spacing): string {
  return spacing[multiplier] || spacing[4];
}

/**
 * Get font size
 * @example getFontSize('lg') => '1.125rem'
 */
export function getFontSize(size: keyof typeof typography.fontSize): string {
  return typography.fontSize[size] || typography.fontSize.base;
}

/**
 * Get border radius
 * @example getBorderRadius('lg') => '0.5rem'
 */
export function getBorderRadius(size: keyof typeof borderRadius): string {
  return borderRadius[size] || borderRadius.lg;
}

/**
 * Get shadow
 * @example getShadow('md') => '0 4px 6px -1px rgba(0, 0, 0, 0.1)...'
 */
export function getShadow(size: keyof typeof shadows): string {
  return shadows[size] || shadows.base;
}

/**
 * Convert hex to HSL
 */
export function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h: number, s: number, l: number;

  l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
      default: h = 0;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Get CSS variable name for a color
 * @example getColorVariable('copper') => '--color-copper'
 */
export function getColorVariable(colorName: string): string {
  return `--color-${colorName.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
}

/**
 * Generate Tailwind color class
 * @example getTailwindColor('primary', 'copper') => 'bg-[#C97D60]'
 */
export function getTailwindColor(
  category: 'primary' | 'secondary' | 'semantic',
  colorName: string,
  property: 'bg' | 'text' | 'border' = 'bg'
): string {
  const colorMap: Record<string, any> = {
    primary: colors.primary,
    secondary: colors.secondary,
    semantic: colors.semantic,
  };

  const color = colorMap[category]?.[colorName];
  if (!color) {
    console.warn(`Color ${category}.${colorName} not found`);
    return '';
  }

  const hex = color.hex || color;
  return `${property}-[${hex}]`;
}

/**
 * Generate responsive classes helper
 */
export function responsive(
  mobile: string,
  tablet?: string,
  desktop?: string
): string {
  const classes = [mobile];
  if (tablet) classes.push(`md:${tablet}`);
  if (desktop) classes.push(`lg:${desktop}`);
  return classes.join(' ');
}

/**
 * Generate spacing classes
 */
export function spacingClasses(
  all?: keyof typeof spacing,
  vertical?: keyof typeof spacing,
  horizontal?: keyof typeof spacing,
  top?: keyof typeof spacing,
  right?: keyof typeof spacing,
  bottom?: keyof typeof spacing,
  left?: keyof typeof spacing
): string {
  const classes: string[] = [];
  
  if (all) classes.push(`p-${all}`);
  if (vertical) classes.push(`py-${vertical}`);
  if (horizontal) classes.push(`px-${horizontal}`);
  if (top) classes.push(`pt-${top}`);
  if (right) classes.push(`pr-${right}`);
  if (bottom) classes.push(`pb-${bottom}`);
  if (left) classes.push(`pl-${left}`);
  
  return classes.join(' ');
}

