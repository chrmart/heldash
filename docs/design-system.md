# HELDASH — Design System & Component Library

This document describes the refined design system and styling approach used in HELDASH v2.0+.

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Typography System](#typography-system)
3. [Spacing Grid (8px)](#spacing-grid-8px)
4. [Color System](#color-system)
5. [Transitions & Motion](#transitions--motion)
6. [Glass Morphism](#glass-morphism)
7. [Components](#components)
8. [Accessibility](#accessibility)
9. [Dark Mode Optimization](#dark-mode-optimization)

---

## Design Philosophy

**"Tech Precision Studio"** — A refined, minimalist design with intentional details.

Key principles:
- **Distinctive**: Modern typography (Geist body + Space Mono display) sets it apart from generic dashboards
- **Refined**: Smooth transitions, strategic micro-interactions, no unnecessary motion
- **Accessible**: Full support for `prefers-reduced-motion`, proper contrast ratios, semantic HTML
- **Consistent**: 8px-based grid system ensures visual harmony across all components
- **Glass Forward**: Refined glass morphism with better blur and saturation

---

## Typography System

### Font Families

```css
--font-sans: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-display: 'Space Mono', monospace;
--font-mono: 'JetBrains Mono', monospace;
```

**Usage**:
- **Body text (14px)**: Geist (--font-sans) — clean, modern reading
- **Headers (h1-h4)**: Space Mono (--font-display) — distinctive, tech-forward
- **Code/Timestamps**: JetBrains Mono (--font-mono) — monospace precision

### Font Sizing & Hierarchy

```css
h1 { font-size: 32px; line-height: 1.2; font-weight: 700; }
h2 { font-size: 24px; line-height: 1.3; font-weight: 700; }
h3 { font-size: 18px; line-height: 1.4; font-weight: 700; }
h4 { font-size: 15px; line-height: 1.5; font-weight: 700; }
body { font-size: 14px; line-height: 1.55; letter-spacing: 0.3px; }
```

### Font Weight Scale

- `400`: Regular body text
- `500`: Medium (secondary importance)
- `600`: Semi-bold (action labels, button text)
- `700`: Bold (headers, active nav items)

---

## Spacing Grid (8px)

All spacing uses an 8px base grid for consistency:

```css
--spacing-xs: 4px      /* Half unit: small gaps */
--spacing-sm: 8px      /* Single unit: padding, gaps */
--spacing-md: 12px     /* 1.5x unit: form gaps, icon spacing */
--spacing-lg: 16px     /* 2x unit: card padding, section gaps */
--spacing-xl: 20px     /* 2.5x unit: topbar height component */
--spacing-2xl: 24px    /* 3x unit: page padding, modal padding */
--spacing-3xl: 32px    /* 4x unit: large sections, empty state padding */
```

**Example usages**:
- Service card padding: `--spacing-lg` (16px)
- Form group gaps: `--spacing-xl` (20px)
- Section gap: `--spacing-2xl` (24px)
- Empty state padding: `--spacing-3xl` (32px)

---

## Color System

### Theme Colors (Root)

```css
[data-theme="dark"] {
  --bg-base: #0a0e14;          /* Deepest background */
  --bg-surface: #0f1419;       /* Surface bg */
  --bg-elevated: #16202d;      /* Elevated surfaces (modals) */

  --text-primary: rgba(255, 255, 255, 0.95);     /* Main text */
  --text-secondary: rgba(255, 255, 255, 0.60);   /* Labels, hints */
  --text-muted: rgba(255, 255, 255, 0.30);       /* Disabled, placeholders */
}

[data-theme="light"] {
  --bg-base: #f8f9fb;
  --bg-surface: #f0f2f7;
  --bg-elevated: #ffffff;

  --text-primary: rgba(10, 12, 20, 0.95);
  --text-secondary: rgba(10, 12, 20, 0.60);
  --text-muted: rgba(10, 12, 20, 0.35);
}
```

### Accent Colors (3 Options)

Users choose from Cyan, Orange, or Magenta:

```css
[data-accent="cyan"] {
  --accent-h: 188;    --accent-s: 100%;    --accent-l: 60%;
}
[data-accent="orange"] {
  --accent-h: 28;     --accent-s: 100%;    --accent-l: 58%;
}
[data-accent="magenta"] {
  --accent-h: 295;    --accent-s: 100%;    --accent-l: 65%;
}

:root {
  --accent: hsl(var(--accent-h), var(--accent-s), var(--accent-l));
  --accent-dim: hsl(var(--accent-h), var(--accent-s), calc(var(--accent-l) - 12%));
  --accent-glow: hsl(var(--accent-h), var(--accent-s), var(--accent-l), 0.20);
  --accent-subtle: hsl(var(--accent-h), var(--accent-s), var(--accent-l), 0.08);
  --accent-ghost: hsl(var(--accent-h), var(--accent-s), var(--accent-l), 0.04);
}
```

### Status Colors

```css
--status-online: #10b981;   /* Green — service reachable */
--status-offline: #f87171;  /* Red — service down */
--status-unknown: rgba(..., 0.20);  /* Gray — not checked yet */
```

### Dark Mode Accent-Subtle Overrides

Per-accent boost for better visibility in dark mode:

```css
[data-theme="dark"][data-accent="cyan"] {
  --accent-subtle: hsl(188, 100%, 60%, 0.12);  /* 12% opacity, not 8% */
}
```

---

## Transitions & Motion

### Easing Curves

```css
--transition-fast: 100ms cubic-bezier(0.4, 0, 0.2, 1);      /* Snappy */
--transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);      /* Standard */
--transition-smooth: 350ms cubic-bezier(0.34, 1.56, 0.64, 1);  /* Bounce */
--transition-slow: 500ms ease;                               /* Slow fade */
```

**When to use**:
- **Fast (100ms)**: Quick feedback on hover/focus (border color, opacity)
- **Base (200ms)**: Standard transitions (background, shadow, transform short distances)
- **Smooth (350ms)**: Bounce effects on elevation (toggle switches, important reveals)
- **Slow (500ms)**: Page fades, modal overlays

### Key Animations

**pulse-ring** (online status):
```css
@keyframes pulse-ring {
  0% { transform: scale(1); opacity: 0.30; }
  100% { transform: scale(2.8); opacity: 0; }
}
```

**pulse-subtle** (offline status breathing):
```css
@keyframes pulse-subtle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.85; transform: scale(0.95); }
}
```

**float** (empty state icon):
```css
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
```

---

## Glass Morphism

### Base Glass Style

```css
.glass {
  background: var(--glass-bg);                /* 5% opacity white overlay */
  backdrop-filter: var(--glass-blur);         /* blur(24px) saturate(200%) */
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);      /* 10% opacity white border */
  box-shadow:
    0 1px 0 var(--glass-highlight) inset,    /* Subtle inner light */
    0 8px 32px var(--glass-shadow);           /* Outer shadow depth */
}
```

### Elevated Glass

```css
.glass-elevated {
  background: var(--glass-highlight);         /* 15% opacity white */
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.15) inset,
    0 12px 40px var(--glass-shadow);
}
```

---

## Components

### Service Card

**Hover effect**:
- Lift: `transform: translateY(-4px)`
- Border: `hsla(..., 0.40)` (brighter)
- Shadow: Expanded to `0 20px 64px`
- Glow: `0 8px 32px hsla(..., 0.12)`

**Icon hover**:
- Background: `var(--accent-glow)` (20% opacity)
- Scale: `1.08x`
- Border: `hsla(..., 0.40)`

### Sidebar Navigation

**Active state**:
- Background: `hsla(..., 0.15)` (dark mode) or `--accent-subtle` (light)
- Border: `hsla(..., 0.40)`
- Shadow: `0 4px 16px hsla(..., 0.18)`
- Gradient overlay: Linear gradient left→transparent

**Hover**:
- Transform: `translateX(2px)` (subtle shift right)
- Border: `var(--glass-border)`
- Gradient appears

### Status Indicators

**Online (dual animation)**:
- Main dot: `box-shadow: 0 0 12px var(--status-online)`
- ::after: Expanding ring (pulse-ring 2.5s)
- ::before: Border pulse (pulse-border 2s)

**Offline (breathing)**:
- Main dot: `box-shadow: 0 0 8px var(--status-offline)`
- Animation: pulse-subtle 1.5s
- ::before: Border with opacity pulse

### Buttons

**Primary**:
```css
.btn-primary {
  background: transparent;
  color: var(--accent);
  border-color: var(--accent);
}
.btn-primary:hover {
  background: var(--accent-subtle);
  box-shadow: 0 4px 20px hsla(..., 0.20);
  transform: translateY(-1px);
}
```

**Ghost**:
```css
.btn-ghost:hover {
  background: var(--glass-bg);
  border-color: var(--glass-highlight);
  transform: translateY(-1px);
}
```

### Form Inputs

**Focus state**:
```css
.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px hsla(..., 0.12);  /* Subtle ring */
  background: var(--glass-highlight);
}
```

### Toggle Switch

- Size: 40px × 22px
- Animation: `--transition-smooth` (350ms cubic-bezier)
- Thumb box-shadow: `0 2px 6px rgba(0, 0, 0, 0.3)` when active
- Color: Changes to `var(--accent)` when checked

---

## Accessibility

### Prefers-Reduced-Motion

Full compliance with `@media (prefers-reduced-motion: reduce)`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }

  /* Disable specific animations */
  .empty-state-icon { animation: none; }
  .service-status { animation: none; }
  .bg-orb { animation: none; }

  /* Keep structure, remove transforms on interaction */
  .service-card:hover { transform: none; }
  .nav-item:hover { transform: none; }
}
```

### Contrast Ratios

- Primary text on background: **WCAG AAA** (7:1+)
- Secondary text: **WCAG AA** (4.5:1)
- Buttons: Sufficient contrast with white/dark borders

### Semantic HTML

- All buttons use `<button>` or proper `<a>` tags
- Form labels: `<label for="...">` with matching `id`
- Status indicators: No accessibility burden (decorative, alt text in icon components)

---

## Dark Mode Optimization

### Accent-Subtle Visibility Boost

Dark mode benefits from enhanced accent-subtle colors to prevent washed-out appearance:

```css
[data-theme="dark"] .service-icon {
  background: hsla(var(--accent-h), var(--accent-s), var(--accent-l), 0.15);
  border-color: hsla(..., 0.35);
}

[data-theme="dark"] .nav-item.active {
  background: hsla(var(--accent-h), var(--accent-s), var(--accent-l), 0.15);
  border-color: hsla(..., 0.35);
  box-shadow:
    0 0 0 1px hsla(..., 0.20),
    0 4px 16px hsla(..., 0.12);
}
```

### Sidebar Logo Icon Glow

```css
.sidebar-logo-icon {
  box-shadow: 0 0 12px hsla(var(--accent-h), var(--accent-s), var(--accent-l), 0.20);
  [data-theme="dark"] & {
    background: hsla(..., 0.15);
  }
}
```

---

## Page-Specific Styling Details

### Dashboard Page

**Grid Layout**:
- Service cards: `grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: var(--spacing-lg)`
- Dashboard groups: `grid-template-columns: repeat(12, 1fr); gap: var(--spacing-xl)`
- Group items inherit same service grid

**Dashboard Groups** (v2.0+):
- Container: `.glass` class with `border-radius: var(--radius-xl)` (24px)
- Padding: `var(--spacing-xl)` (20px) with `gap: var(--spacing-lg)` between header + items
- Hover: Subtle border color transition to `hsla(..., 0.25)` accent
- **Group Header** (`.dashboard-group-header`):
  - Flex layout with drag handle, name, col-span selector, delete button
  - Text: Uppercase `12px`, `font-weight: 700`, `letter-spacing: 0.5px`
  - Border-bottom: `1px solid var(--glass-border)` with `padding-bottom: var(--spacing-md)`
- **Editing Features**:
  - **Drag handle**: `GripVertical` icon (14px), appears on hover, grab cursor
  - **Name editing**: Double-click to edit, inline input with auto-focus
  - **Width selector**: `<select>` with options (25%, 33%, 50%, 66%, 100% = col_span 3, 4, 6, 8, 12)
  - **Delete button**: X icon, removes group and ungroups items to main dashboard
- **Nested items**: Inherit service grid layout, sort independently within group

**Service Cards on Dashboard**:
- Each card: `padding: var(--spacing-lg)` (16px)
- Icon: 44px × 44px with `border-radius: var(--radius-md)`
- Status dot: 10px diameter, dual animations for online status
- Name: `font-size: 15px; font-weight: 600` (Geist)
- Description: `font-size: 12px; color: var(--text-muted)`

**Edit Mode**:
- Drag handles appear on cards with `GripVertical` icon
- Handles: `opacity: 0 → 1` on hover (smooth transition)
- Remove buttons: Bottom-right with trash icon

### Services/Apps Page

**Table Layout**:
- Fixed column widths via `<colgroup>`
- Hover row: Light background with `var(--glass-bg)`
- Action buttons: Pencil (edit) + Trash (delete) on right, `opacity: 0 → 1`
- Status dot: Same as dashboard, inline with app name

**Service Modal** (Add/Edit):
- Modal padding: `var(--spacing-3xl)` (32px)
- Form groups: `gap: var(--spacing-xl)` (20px between groups)
- Icon upload: Drag-drop area with dashed border
- Buttons: Primary (Create/Save) + Ghost (Cancel)

### Media Page

**Media Cards**:
- Similar to service cards but shows instance type (Radarr, Sonarr, Prowlarr, SABnzbd)
- Color-coded: Each type has distinct color accent
- Stats display: Queue count, progress bars with smooth animations

**Queue/Calendar Views**:
- List items: `padding: var(--spacing-md)` with subtle dividers
- Progress bars: Accent color with rounded ends
- Expandable sections: Smooth height transition on expand

### Docker Page

**Container Table**:
- Headers: Sortable with cursor pointer, hover underline
- Row hover: `background: var(--glass-bg)` transition
- Status badges: `padding: var(--spacing-sm) var(--spacing-md)`, `border-radius: var(--radius-md)`
- Action buttons: Start/Stop/Restart in dropdown (admin only)

**Stats Overview Bar**:
- Large numbers: `font-size: 24px; font-weight: 700; font-family: var(--font-display)`
- Labels: Uppercase with `letter-spacing: 0.5px`
- Pill containers: Subtle glass background with border

**Log Viewer**:
- Monospace font: `var(--font-mono)`, `font-size: 13px`
- Dark background: `var(--bg-surface)`
- Filter input: Standard form input with focus ring
- Auto-scroll indicator: Subtle animation

### Widgets Page

**Widget Grid**:
- Same auto-fill grid as services: `minmax(150px, 1fr)`
- Widget cards: `.glass` with enhanced shadow on hover
- Config panels: Tabbed interface (Server Status, AdGuard, Docker, etc.)

**Widget Cards** (on Dashboard):
- Server Status: Progress bars with icon + label + value
- AdGuard Home: Query stats with blocked percentage large display
- Docker Overview: Container counts + Start/Stop dropdown
- Custom buttons: Grid of clickable buttons

### Settings Page

**Tabbed Interface**:
- Tab buttons: Uppercase labels, active state with accent border-bottom
- Tab content: Smooth fade transition between tabs (opacity 0→1)
- Section headers: `h3` style with `font-family: var(--font-display)`

**General Tab**:
- Theme selector: Radio buttons or dropdown with color swatches
- Accent preview: Small circle showing current accent color
- Dashboard title input: Standard form-input with focus ring

**Users Tab**:
- User table: Similar layout to services table
- Action buttons: Edit + Delete on right
- Status badge: Active/Inactive with color coding

**Groups Tab** (Multi-section):
- Group list: Expandable sections for each group
- Apps/Media/Widgets tabs per group: Scrollable lists with checkboxes
- Docker permissions: Toggle switches with labels
- Background selector: Thumbnail grid for background images

**OIDC Tab** (prepared):
- Input fields: `form-input` with `--transition-fast` on focus
- Provider selector: Dropdown with standard styling

### Sidebar Component

**Logo Section**:
- Icon: 32px × 32px with glow shadow
- Text: `font-size: 16px; font-weight: 600; letter-spacing: -0.3px`
- Border-bottom: `1px solid var(--glass-border)`

**Status Pills**:
- Online/Offline counters: Side-by-side glass pill containers
- Dot + count: `gap: var(--spacing-xs)` (4px)
- Hover: No additional effect (informational only)
- Font: `11px; font-weight: 600; letter-spacing: 0.3px`

**Navigation Items**:
- Height: ~36px with padding `var(--spacing-sm)`
- Active state: `hsla(..., 0.15)` background with glow shadow
- Hover: 2px translate right with gradient overlay
- Icon: 16px size, flex-shrink: 0
- Text: Hidden on mobile (< 768px)

**Section Labels**:
- Font: `10px; font-weight: 600; text-transform: uppercase`
- Color: `var(--text-muted)`
- Letter-spacing: `1px`

### Topbar Component

**Time Display** (Center):
- Font: `var(--font-mono)` for precision
- Font-size: `13px; font-weight: 500`
- Server time: Fetched once, ticked every second

**Topbar Widgets** (Center):
- Compact display of pinned widgets
- Server Status: CPU/RAM in compact bars
- AdGuard: Block count or percentage
- Docker Overview: Running count + quick-access dropdown
- Gap: `var(--spacing-lg)` between widgets

**Action Buttons** (Right):
- Theme toggle: Sun/Moon icons
- Check All: RefreshCw icon, `spinner` during check
- Add buttons: Plus icon + label, primary style
- Edit Dashboard: Pencil or text label
- Guest Mode: (admin only) button style varies
- Login/Logout: Primary or secondary style

### Modals

**Modal Overlay**:
- Background: `rgba(0, 0, 0, 0.50)` with `backdrop-filter: blur(8px)`
- Animation: Fade-in 200ms

**Modal Content**:
- Background: `.glass` class
- Padding: `var(--spacing-3xl)` (32px)
- Border-radius: `var(--radius-xl)` (24px)
- Animation: Slide-up 200ms from bottom with scale(0.98)

**Modal Title**:
- Font: `var(--font-display)`, `20px`, `font-weight: 700`
- Margin-bottom: `var(--spacing-2xl)` (24px)

**Login Modal**:
- Username/Password inputs: Standard form-input styling
- Error message: Red background with status-offline color
- Submit button: Primary style, full width

---

## Responsive Design Notes

### Mobile (< 768px)

- **Sidebar**: Collapses to 60px width (icon-only)
- **Sidebar text**: Hidden (nav-item span, logo-text, section-labels)
- **Service grid**: `minmax(120px, 1fr)` (smaller cards)
- **Dashboard groups**: Still 12-column grid, but wrap more aggressively
- **Topbar**: Adjusts button sizes, hides some labels

### Tablet (768px - 1024px)

- **Sidebar**: Full width (240px)
- **Service grid**: `minmax(130px, 1fr)` (standard)
- **Modal**: `max-width: 480px`

### Desktop (> 1024px)

- All standard spacing and sizing applies
- No further adjustments

---

## Implementation Checklist

When adding new components:

- [ ] Use spacing from `--spacing-*` variables (never hardcoded px)
- [ ] Use colors from CSS variables (never hardcoded hex/rgb)
- [ ] Use transitions from `--transition-*` (never hardcoded ms)
- [ ] Apply `.glass` for card backgrounds
- [ ] Test in both light and dark modes
- [ ] Ensure accent colors work in all 3 variants (cyan/orange/magenta)
- [ ] Add `prefers-reduced-motion` rule if animations are present
- [ ] Verify contrast ratio (WCAG AA minimum)
- [ ] Use semantic HTML (button, a, label, etc.)
- [ ] Test on mobile (< 768px) for responsive behavior
- [ ] Verify font families: body=Geist, display=Space Mono, mono=JetBrains Mono
- [ ] Use icon sizes consistently: 16px (topbar), 14px (headers), 12px (buttons)

---

**Last Updated**: March 2026
**Design Version**: 2.0+ (Refined Typography + Glass Morphism Enhancements + Dashboard Groups)
**Pages Updated**: Dashboard, Services, Media, Docker, Widgets, Settings, Sidebar, Topbar, Modals
