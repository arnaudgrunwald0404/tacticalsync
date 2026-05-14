# AIPulse Design System

## Overview

The design system is **utility-first Tailwind CSS** with a fully custom theme — no external component library (no shadcn, Material UI, Radix, etc.). Visual identity uses a **metallurgical naming convention** (copper, cast-iron, platinum, brass, etc.) that reinforces a premium, industrial aesthetic. All tokens are defined in `tailwind.config.js` and `app/globals.css`.

---

## Color Palette

### Brand Colors (Tailwind custom tokens)

| Token | Hex | Usage |
|---|---|---|
| `platinum` | `#FAF8F5` | Page background, light surfaces |
| `cast-iron` | `#37352A` | Primary text, dark foreground |
| `copper` | `#FF7A52` | Primary accent — CTAs, highlights, active states |
| `copper-hover` | `#E66E4A` | Hover state for copper elements |
| `alloy` | `#FFA680` | Secondary warm accent |
| `bronze` | `#6C3A2A` | Dark warm accent |
| `verdigris` | `#9EB4AB` | Teal-green accent |
| `steel` | `#697771` | Secondary / muted text |
| `pewter` | `#A1B4BA` | Tertiary text, subtle UI |
| `white-gold` | `#F4EBD7` | Warm highlight, premium surfaces |
| `brass` | `#C3B497` | Warm accent, border-adjacent tones |

Use these as standard Tailwind utilities: `text-copper`, `bg-platinum`, `border-cast-iron`, etc.

### CSS Variables

Defined in `:root` for use in non-Tailwind CSS:

```css
--copper:    #FF7A52
--cast-iron: #37352A
--platinum:  #FAF8F5
--border:    rgba(55,53,42,0.10)   /* 10% cast-iron */
--border-md: rgba(55,53,42,0.18)   /* 18% cast-iron */
```

### Status / Semantic Colors

Used for initiative and badge states:

| Status | Background | Text | Border |
|---|---|---|---|
| Done | `bg-green-50` | `text-green-700` | `border-green-200` |
| In Progress | `bg-yellow-50` | `text-yellow-700` | `border-yellow-200` |
| Not Started | `bg-platinum` | `text-steel` | `.border-cc` |
| Blocked | `bg-red-50` | `text-red-700` | `border-red-200` |

### Confidence Levels (Discover)

| Level | Color | Hex |
|---|---|---|
| High | Green | `#4CAF82` |
| Medium | Copper | `#FF7A52` |
| Low | Blue | `#7B9FE8` |

---

## Typography

### Font Families

| Role | Family | Weights | Tailwind token |
|---|---|---|---|
| Headings | Atkinson Hyperlegible | 400, 700 | `font-heading` |
| Body | Public Sans | 400, 500, 600, 700 | `font-body` (default) |
| Monospace / labels | Fira Code | 400, 500 | `font-mono` / `.font-mono-cc` |

Fonts are loaded from Google Fonts in `app/globals.css`.

### Rules

- `h1–h4` automatically receive Atkinson Hyperlegible via global CSS.
- `body` defaults to Public Sans.
- Use `.font-heading` to apply the heading font outside of `h1–h4`.
- Use `.font-mono-cc` for metadata labels, technical tags, and monospace-style UI text (e.g., Discover confidence bar labels, PRD field labels).
- Fluid type for large display headings: `clamp(36px, 6vw, 52px)`.

---

## Spacing & Layout

Uses Tailwind's default spacing scale. Common values in the codebase:

| Context | Values |
|---|---|
| Component gaps | `gap-1`, `gap-2`, `gap-3`, `gap-4`, `gap-6`, `gap-8` |
| Padding | `p-2`, `p-3`, `p-4`, `px-3`, `py-1.5`, `py-2.5` |
| Margins | `mb-1`, `mb-2`, `mt-2`, `mt-4` |
| Icons | `w-4 h-4` |
| Medium buttons / avatars | `w-7 h-7` |

Layout patterns: flexbox (`flex`, `flex-col`, `flex-wrap`, `gap-*`) for most UI; CSS Grid for multi-column layouts (e.g., the Sherpa teams grid uses `grid-template-columns: repeat(4, 1fr)` with responsive breakpoints).

---

## Border & Shadow System

### Border Utilities

| Class | Value | Use |
|---|---|---|
| `.border-cc` | `rgba(55,53,42,0.10)` | Default subtle border |
| `.border-cc-md` | `rgba(55,53,42,0.18)` | Slightly more visible border |
| `border-copper` | `#FF7A52` | Accent border (active, selected) |
| Standard Tailwind | `border-green-200`, `border-red-200`, etc. | Status badges |

Prefer `.border-cc` as the default divider. Use `border-copper` to indicate selection or focus.

### Shadow Scale

| Class | Use |
|---|---|
| `shadow-sm` | Cards, subtle elevation |
| `shadow-xl` | Overlays, floating elements |
| `shadow-2xl` | Drawers, side panels |

Custom copper glow (used on `.init-row` hover):
```css
box-shadow: inset 3px 0 0 rgba(255, 122, 82, 0.55);
```

---

## Animation & Motion

### Keyframes

| Name | Behavior | Duration / Easing |
|---|---|---|
| `rowReveal` | Slide up (10px) + fade in | 0.45s `cubic-bezier(0.16, 1, 0.3, 1)` |
| `headerSlideIn` | Slide in from left (8px) + fade in | 0.5s `cubic-bezier(0.16, 1, 0.3, 1)` |
| `fadeDown` | Fade in + slide down (5px) | 0.4s `ease` |
| `discoverFadeUp` | Slide up (12px) + fade in | 0.5s `ease` (Discover) |
| `welcomeSlideUp` | Slide up (48px) + fade out (exit) | 0.38s `ease` (Discover) |

### Applied Classes

| Class | Keyframe | Applied to |
|---|---|---|
| `.init-row` | `rowReveal` | Initiative rows in `InitiativeTable` |
| `.section-header-reveal` | `headerSlideIn` | Section `h2` wrappers |
| `.header-reveal` | `fadeDown` | Top header bar |

`.init-row` also has an inset copper glow on hover (see above).

### Hover Transitions

Standard interactive transitions: `transition: 0.15s–0.2s ease` on color and background changes. Use `transition-colors` or `transition` with `duration-150`/`duration-200` for Tailwind-side transitions.

---

## Component Inventory

| Component | File | Role |
|---|---|---|
| `Header` | [`components/Header.tsx`](components/Header.tsx) | Top navigation bar |
| `LeftNav` | [`components/LeftNav.tsx`](components/LeftNav.tsx) | Collapsible sidebar navigation |
| `Drawer` | [`components/Drawer.tsx`](components/Drawer.tsx) | Initiative detail side panel |
| `InitiativeTable` | [`components/InitiativeTable.tsx`](components/InitiativeTable.tsx) | Data grid with animated rows (`.init-row`) |
| `IdeasDrawer` | [`components/IdeasDrawer.tsx`](components/IdeasDrawer.tsx) | Ideas side panel |
| `NewIdeaDrawer` | [`components/NewIdeaDrawer.tsx`](components/NewIdeaDrawer.tsx) | Create new idea panel |
| `DropIdeaModal` | [`components/DropIdeaModal.tsx`](components/DropIdeaModal.tsx) | Modal dialog for dropping ideas |
| `SettingsModal` | [`components/SettingsModal.tsx`](components/SettingsModal.tsx) | Settings overlay |
| `VoiceButton` | [`components/VoiceButton.tsx`](components/VoiceButton.tsx) | Global voice input trigger |
| `OpportunityLandscape` | [`components/OpportunityLandscape.tsx`](components/OpportunityLandscape.tsx) | Opportunity visualization grid |
| `SignalDrop` | [`components/SignalDrop.tsx`](components/SignalDrop.tsx) | Signal indicator widget |
| `ThemeHeatmap` | [`components/ThemeHeatmap.tsx`](components/ThemeHeatmap.tsx) | Theme-frequency heatmap visualization |
| `HobermanSphere` | [`components/hoberman/HobermanSphere.tsx`](components/hoberman/HobermanSphere.tsx) | 3D interactive sphere visualization |

---

## Utility Class Reference

| Class | Definition | Use |
|---|---|---|
| `.font-heading` | `font-family: 'Atkinson Hyperlegible'` | Heading font outside `h1–h4` |
| `.font-mono-cc` | `font-family: 'Fira Code', monospace` | Metadata labels, technical UI |
| `.border-cc` | `border-color: rgba(55,53,42,0.10)` | Default subtle border |
| `.border-cc-md` | `border-color: rgba(55,53,42,0.18)` | Medium-emphasis border |
| `.init-row` | `rowReveal` animation + copper hover glow | Initiative table rows |
| `.section-header-reveal` | `headerSlideIn` animation | Section heading wrappers |
| `.header-reveal` | `fadeDown` animation | Top header bar |

---

## Background

The default `body` background is a dual radial-gradient on platinum, fixed-attached for a parallax effect:

```css
background-color: #FAF8F5;
background-image:
  radial-gradient(ellipse 70% 45% at 8% 0%,   rgba(255,122,82,0.08) 0%, transparent 65%),
  radial-gradient(ellipse 50% 40% at 94% 100%, rgba(195,180,151,0.09) 0%, transparent 65%);
background-attachment: fixed;
```

This creates a warm copper glow at top-left and a soft brass haze at bottom-right, giving depth without distraction.

---

## Z-Index Scale

No formal token system — values used in the codebase:

| Value | Context |
|---|---|
| `z-20` | Sticky headers, overlapping sections |
| `z-40` | Dropdowns, popovers |
| `z-50` | Drawers, modals |
| `z-[1000]` | Confirm modals over drawers (`.discover-modal-overlay`) |
