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

---

**Last Updated**: March 2026
**Design Version**: 2.0+ (Refined Typography + Glass Morphism Enhancements)
