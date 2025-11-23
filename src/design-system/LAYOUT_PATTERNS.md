# Layout Patterns

This document describes the reusable layout patterns for headers and sidebars used across the application.

## Table of Contents

1. [Header (Top Bar)](#header-top-bar)
2. [Left Sidebar (Navigation)](#left-sidebar-navigation)
3. [Right Sidebar (Contextual Feeds)](#right-sidebar-contextual-feeds)
4. [Layout Combinations](#layout-combinations)
5. [Responsive Behavior](#responsive-behavior)
6. [Implementation Examples](#implementation-examples)

---

## Header (Top Bar)

The header is a persistent navigation bar that appears at the top of all application pages.

### Structure

Three-section layout:

```
┌─────────────────────────────────────────────────────────┐
│ [Left]              [Center]              [Right]       │
│ Back + Logo         Tabs (Desktop)       User Profile   │
└─────────────────────────────────────────────────────────┘
```

### Sections

#### Left Section
- **Back Button** (conditional): Shown when not on main/default view
  - Icon: `ArrowLeft` from lucide-react
  - Text: "Back"
  - Hidden on mobile when tabs are hidden
  - Styling: `text-muted-foreground hover:text-foreground`
- **Logo**: Application branding
  - Variant: `minimal`
  - Size: `lg`
  - Responsive: `scale-75 sm:scale-100`

#### Center Section
- **Tabs**: Primary navigation between main sections
  - Hidden on mobile (replaced by bottom navigation)
  - Centered using absolute positioning
  - Common tabs: "RCDO", "Meetings", "My Workspace"

#### Right Section
- **User Profile Header**: Avatar, name, and account menu
  - Positioned absolutely to avoid clipping
  - Includes dropdown menu

### Styling

```tsx
<header className="sticky top-0 z-50 border-b bg-white">
  <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between relative pr-20">
    {/* Content */}
  </div>
</header>
```

**CSS Variables:**
- `z-index`: `50`
- `background`: `white`
- `border-bottom`: `1px solid hsl(var(--border))`
- `padding`: `0.75rem` mobile, `1rem` desktop

### Responsive Behavior

| Breakpoint | Tabs | Back Button | Logo Scale |
|------------|------|-------------|------------|
| Mobile (`< 640px`) | Hidden | Conditional | `0.75` |
| Desktop (`≥ 640px`) | Visible | Conditional | `1.0` |

---

## Left Sidebar (Navigation)

Left sidebars provide primary navigation, settings, and hierarchical content navigation.

### Settings Navigation Pattern

**Use Case**: Settings pages, configuration pages

**Structure:**
- Fixed width: `16rem` (256px)
- Full height: `min-h-[calc(100vh-73px)]`
- Border: Right border with Rose Gold accent
- Background: Platinum (`#F5F3F0`)

**Navigation Items:**
- Full-width buttons
- Active: Titanium background (`#4A5D5F`) with white text
- Inactive: Ghost variant with Titanium text
- Hover: Platinum background

**Example:**
```tsx
<nav className="w-64 border-r border-[#E8B4A0]/30 bg-[#F5F3F0] min-h-[calc(100vh-73px)]">
  <div className="p-4 space-y-1">
    {sections.map((section) => (
      <Button
        key={section.id}
        variant={activeSection === section.id ? "secondary" : "ghost"}
        size="sm"
        className={cn(
          "font-body w-full justify-start",
          activeSection === section.id 
            ? "bg-[#4A5D5F] text-white hover:bg-[#5B6E7A]" 
            : "text-[#4A5D5F] hover:bg-[#F5F3F0]"
        )}
      >
        {section.label}
      </Button>
    ))}
  </div>
</nav>
```

### Hierarchical Navigation Sidebar

**Use Case**: Detail pages with tree navigation (RCDO, documents, etc.)

**Features:**
- Resizable (desktop): Drag handle to adjust width
- Collapsible sections: Expand/collapse groups
- Active highlighting: Current item highlighted
- Mobile: Hidden, accessible via Sheet

**Styling:**
```tsx
<aside className="hidden md:flex flex-col h-full">
  <div 
    className="bg-background rounded-lg border border-sidebar-border shadow-lg overflow-y-auto p-3"
    style={{ width: `${sidebarWidth}px` }}
  >
    {/* Navigation tree */}
  </div>
</aside>
```

**Resize Handle:**
- Width: `4px` (1rem)
- Cursor: `col-resize`
- Hover: Copper accent color
- Position: Right edge

**Default Widths:**
- Default: `308px`
- Min: `200px`
- Max: `600px`
- Saved to localStorage

---

## Right Sidebar (Contextual Feeds)

Right sidebars display contextual information, activity feeds, or supplementary content.

### Check-in Feed Pattern

**Use Case**: Activity feeds, check-ins, updates

**Structure:**
- Fixed position: `fixed right-0 top-[73px] bottom-0`
- Fixed width: `360px`
- Border: Left border
- Background: White with shadow
- Scrollable: `overflow-y-auto`

**Example:**
```tsx
<aside className="hidden lg:block fixed right-0 top-[73px] bottom-0 w-[360px] border-l border-sidebar-border bg-background shadow-lg overflow-y-auto p-3 z-10">
  <CheckinFeedSidebar {...props} />
</aside>
```

**Content Patterns:**
- Feed items: Chronological list
- Grouping: By date or category
- Empty states: Helpful messages
- Loading states: Skeleton loaders

---

## Layout Combinations

### Pattern 1: Header + Main Content

```
┌────────────────────────────────────┐
│           Header                    │
├────────────────────────────────────┤
│                                    │
│      Main Content                  │
│      (Scrollable)                  │
│                                    │
└────────────────────────────────────┘
```

**Use Case**: Simple pages, landing pages

### Pattern 2: Header + Left Sidebar + Main

```
┌────────────────────────────────────┐
│           Header                    │
├──────────┬─────────────────────────┤
│          │                          │
│  Left    │   Main Content           │
│ Sidebar  │   (Scrollable)           │
│          │                          │
└──────────┴─────────────────────────┘
```

**Use Case**: Settings, detail pages with navigation

### Pattern 3: Header + Main + Right Sidebar

```
┌────────────────────────────────────┐
│           Header                    │
├──────────────────────┬──────────────┤
│                     │              │
│   Main Content      │   Right      │
│   (Scrollable)       │   Sidebar    │
│                     │              │
└──────────────────────┴──────────────┘
```

**Use Case**: Dashboard with activity feed

### Pattern 4: Header + Left + Main + Right

```
┌────────────────────────────────────┐
│           Header                    │
├──────────┬──────────────┬──────────┤
│          │              │          │
│  Left    │   Main       │  Right   │
│ Sidebar  │   Content     │ Sidebar  │
│          │              │          │
└──────────┴──────────────┴──────────┘
```

**Use Case**: Complex detail pages

---

## Responsive Behavior

### Mobile (`< 640px`)

- **Header**: Tabs hidden, Logo scaled down
- **Left Sidebar**: Hidden, accessible via Sheet/Drawer
- **Right Sidebar**: Hidden
- **Bottom Navigation**: Visible for primary navigation

### Tablet (`640px - 1023px`)

- **Header**: Full layout with tabs
- **Left Sidebar**: Visible, fixed width
- **Right Sidebar**: Hidden
- **Bottom Navigation**: Hidden

### Desktop (`≥ 1024px`)

- **Header**: Full layout
- **Left Sidebar**: Visible, resizable (if applicable)
- **Right Sidebar**: Visible, fixed width
- **Bottom Navigation**: Hidden

---

## Implementation Examples

### Complete Header Implementation

```tsx
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Logo from '@/components/Logo';
import { UserProfileHeader } from '@/components/ui/user-profile-header';
import { ArrowLeft } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

function AppHeader({ activeTab, onTabChange, showBack = false }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 border-b bg-white">
      <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between relative pr-20">
        {/* Left */}
        <div className="flex items-center gap-4">
          {showBack && !isMobile && (
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
          <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100" />
        </div>

        {/* Center */}
        {!isMobile && (
          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
            <Tabs value={activeTab} onValueChange={onTabChange}>
              <TabsList className="h-10">
                <TabsTrigger value="tab1" className="px-6">Tab 1</TabsTrigger>
                <TabsTrigger value="tab2" className="px-6">Tab 2</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        {/* Right */}
        <UserProfileHeader />
      </div>
    </header>
  );
}
```

### Settings Sidebar Implementation

```tsx
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function SettingsSidebar({ sections, activeSection, onSectionChange }) {
  return (
    <nav className="w-64 border-r border-[#E8B4A0]/30 bg-[#F5F3F0] min-h-[calc(100vh-73px)]">
      <div className="p-4 space-y-1">
        {sections.map((section) => (
          <Button
            key={section.id}
            variant={activeSection === section.id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onSectionChange(section.id)}
            className={cn(
              "font-body w-full justify-start",
              activeSection === section.id 
                ? "bg-[#4A5D5F] text-white hover:bg-[#5B6E7A] font-medium" 
                : "text-[#4A5D5F] hover:bg-[#F5F3F0] hover:text-[#2C2C2C]"
            )}
          >
            {section.label}
          </Button>
        ))}
      </div>
    </nav>
  );
}
```

### Right Feed Sidebar Implementation

```tsx
function ActivityFeedSidebar({ items }) {
  return (
    <aside className="hidden lg:block fixed right-0 top-[73px] bottom-0 w-[360px] border-l border-sidebar-border bg-background shadow-lg overflow-y-auto p-3 z-10">
      <div className="space-y-4">
        <h3 className="font-heading text-lg font-semibold">Activity Feed</h3>
        {items.map((item) => (
          <FeedItem key={item.id} {...item} />
        ))}
      </div>
    </aside>
  );
}
```

---

## Design Tokens

All layout tokens are available in `src/design-system/tokens.ts`:

```typescript
import { layout } from '@/design-system/tokens';

// Header
const headerHeight = layout.header.height.desktop; // '4rem'
const headerZIndex = layout.header.zIndex; // 50

// Sidebars
const sidebarWidth = layout.sidebars.left.width.default; // '16rem'
const sidebarBackground = layout.sidebars.left.background; // '#F5F3F0'
```

---

## Accessibility

1. **Keyboard Navigation**: All interactive elements must be keyboard accessible
2. **Focus Indicators**: Clear focus states for navigation items
3. **ARIA Labels**: Proper labeling for screen readers
4. **Skip Links**: Option to skip sidebar navigation
5. **Touch Targets**: Minimum 44x44px for mobile interactions
6. **Screen Reader Announcements**: Announce sidebar open/close states

---

**Last Updated:** 2024  
**Version:** 1.0.0

