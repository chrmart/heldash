# HELDASH — UI Components Showcase

A visual reference guide for all refined UI components in HELDASH v2.0+.

---

## Table of Contents

1. [Buttons](#buttons)
2. [Cards](#cards)
3. [Forms](#forms)
4. [Status Indicators](#status-indicators)
5. [Navigation](#navigation)
6. [Data Display](#data-display)
7. [Modals & Overlays](#modals--overlays)
8. [Animations](#animations)

---

## Buttons

### Button Styles

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ ✓ PRIMARY       │    │ ○ GHOST         │    │ ✗ DANGER        │
│ Accent border   │    │ Subtle border   │    │ Error color     │
│ Outline style   │    │ Low contrast    │    │ Warning intent  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
  Hover: Glow          Hover: Glass bg         Hover: Red glow
  Shadow              opacity ↑                opacity ↑
```

### Variants

- **`btn-primary`**: Outline with accent color
  - Hover: `--accent-subtle` background + glow shadow
  - Active: Scale 0.96 for tactile feedback

- **`btn-ghost`**: Minimal, secondary actions
  - Hover: Glass background with enhanced border

- **`btn-danger`**: Destructive actions (delete, remove)
  - Hover: Red-tinted background with red glow

- **`btn-sm`**: Small variant for compact spaces
  - Padding: `--spacing-xs` × `--spacing-md`
  - Font: 12px

- **`btn-icon`**: Icon-only, square shape
  - 36px × 36px, centered content
  - Used for: Edit, Delete, Refresh, Settings

---

## Cards

### Service Card

```
┌────────────────────────────────┐
│ 🔵  Plex Media Server    [✎][✗]│  ← Admin actions (hover)
│ https://plex.example.com       │
│                                │
│ Status: 🟢 Online              │  ← Dual-pulse animation
└────────────────────────────────┘
    ↓ Hover: Lift 4px + Glow
```

**Details**:
- Icon: 44×44px with `--accent-subtle` background
- Icon hover: Scale 1.08x + border bright
- Name: `15px bold` (Geist)
- URL: `11px muted` (monospace)
- Status: 10px dot with animations
- Spacing: `--spacing-lg` (16px padding)

### Dashboard Group

```
┌──────────────────────────────────────┐
│ ⋮ MEDIA       [50%]  [×]             │  ← Header (edit mode)
├──────────────────────────────────────┤
│ 🎬 Radarr   🎬 Sonarr   🎬 Prowlarr  │
│                                      │
│ (Items inside same service grid)    │
└──────────────────────────────────────┘
    Drag: Group lifts (transform)
    Hover: Border accent, glow shadow
    Edit: Drag handle + width selector + delete button
```

**Styling**:
- Class: `.glass .dashboard-group`
- Radius: `--radius-xl` (24px)
- Padding: `--spacing-xl` (20px)
- Transition: `all var(--transition-smooth)` (350ms cubic-bezier)
- Min-height: 100px

**Header** (`.dashboard-group-header`):
- Flex layout: `gap: var(--spacing-md)`, align-items: center
- Font: 12px, `font-weight: 700`, `letter-spacing: 0.5px`, uppercase
- Border-bottom: `1px solid var(--glass-border)` with `padding-bottom: var(--spacing-md)`

**Edit Mode Controls**:
- **Drag handle**: `GripVertical` icon (14px), grab cursor, color transition on hover
- **Name editing**: Double-click to edit inline, auto-focused input field
- **Width selector**: `<select>` dropdown with 5 options:
  - 25% (`col_span=3`)
  - 33% (`col_span=4`)
  - 50% (`col_span=6`) — default
  - 66% (`col_span=8`)
  - 100% (`col_span=12`)
- **Delete button**: X icon, removes group and ungroups all items

**Nested Items Grid**:
- Same layout as ungrouped items: `services-grid` with `gridAutoFlow: dense`
- Items maintain their own drag handles and remove buttons
- Separate DnD context for group items

---

## Forms

### Text Input

```
Label
┌────────────────────────────┐
│ Placeholder text...        │
└────────────────────────────┘
        ↓ Focus:
┌────────────────────────────┐
│ Entered text              │  ← Accent ring
│                           │
└────────────────────────────┘ ← Accent border
```

**States**:
- **Default**: Glass background, subtle border
- **Hover**: Border color `hsla(..., 0.20)` accent
- **Focus**: Accent border + ring `hsla(..., 0.12)`, glass highlight bg
- **Disabled**: Muted text, no interaction

### Toggle Switch

```
OFF                      ON
┌─────────────────┐  ┌─────────────────┐
│ ○               │  │               ●  │
└─────────────────┘  └─────────────────┘
  40px × 22px         Accent background
  Animation: 350ms    Thumb: White + shadow
```

**Details**:
- Size: 40×22px
- Animation: `--transition-smooth` (cubic-bezier bounce)
- Active: Accent background, white thumb
- Shadow: Box-shadow on thumb

### Checkbox Group

```
☑ Enable notifications
☐ Show in topbar
☐ Use custom icon
```

**Details**:
- Standard HTML checkbox styling
- Custom appearance: Accent color when checked
- Label: Clickable, right-side alignment

### Select Dropdown

```
┌─────────────────────────┐
│ Select an option  ▼     │
└─────────────────────────┘
  Focus ring: Accent color
  Options: Glass-styled
```

---

## Status Indicators

### Online Status (Active)

```
Animation over 2.5 seconds:

Frame 0:    Frame 1:    Frame 2:    Frame 3:
🟢          🟢            🟢         🟢
  ◯           ◯◯◯◯        ◯◯◯◯◯◯◯

Expanding ring fades out, double-pulse effect
```

**Details**:
- Main dot: 10px, `var(--status-online)` (#10b981)
- Box-shadow: `0 0 12px` glow
- ::after: Expanding ring (pulse-ring 2.5s)
- ::before: Border pulse (pulse-border 2s)
- Combined effect: Vivid, attention-catching

### Offline Status (Inactive)

```
Animation over 1.5 seconds:

Breathing effect:
100% → 85% opacity + slight scale-down → 100%

🔴 (visible + breathing)
```

**Details**:
- Main dot: 10px, `var(--status-offline)` (#f87171)
- Box-shadow: `0 0 8px` glow
- ::before: Border with opacity pulse
- Animation: pulse-subtle 1.5s ease-in-out
- Effect: Calm, subtle indication of downtime

### Unknown Status (Checking)

```
🔘 Neutral gray dot

No animation, static appearance
```

**Details**:
- Dot: `var(--status-unknown)` (gray)
- No pulsing or animation
- Indicates: Health check not yet performed

---

## Navigation

### Sidebar Nav Item

```
Normal:     Hover:         Active:
│ 📊 Apps  │ 📊 Apps ▶   │ 📊 Apps ✨
│          │ (2px shift)  │ (glow bg)
│          │              │
```

**States**:
- **Normal**: `var(--text-secondary)`, transparent bg
- **Hover**:
  - Color: `var(--text-primary)`
  - Transform: `translateX(2px)` (2px right shift)
  - Gradient overlay appears
  - Background: Subtle glass effect
- **Active**:
  - Color: `var(--accent)`
  - Background: `hsla(..., 0.15)` (dark mode boost)
  - Border: `hsla(..., 0.40)` accent color
  - Shadow: Glow effect `0 4px 16px hsla(..., 0.18)`
  - Font-weight: 600 (semi-bold)

---

## Data Display

### Table / List Item

```
┌──────────────────────────────────────┐
│ Plex           https://plex.example  │ 🟢
│ [hover bg]                          [✎][✗]
└──────────────────────────────────────┘
```

**Details**:
- Hover: `background: var(--glass-bg)`
- Action icons: Appear with opacity 0→1 transition
- Spacing: Consistent padding per `--spacing-*` grid
- Row height: ~48px for touch-friendly targets

### Progress Bar

```
100% ████████████████████░░░░░░░░░░░░░░ 60%
      └─ accent color ─┘└─ lighter ─┘
      Rounded ends, smooth width transition
```

**Details**:
- Height: 4px for subtle, readable style
- Color: `var(--accent)` for filled portion
- Animation: Smooth transition on value change
- Border-radius: `99px` (fully rounded)

### Status Badge

```
✓ RUNNING       ✗ STOPPED       ⟳ RESTARTING
Green badge    Red badge      Orange badge
```

**Details**:
- Padding: `--spacing-sm` × `--spacing-md`
- Border-radius: `--radius-md` (12px)
- Font: 12px, semi-bold, uppercase
- Color: Semantic (green=running, red=stopped, orange=restarting)

---

## Modals & Overlays

### Modal Dialog

```
┌─────────────────────────────────────┐
│ Add New App                    [✕]  │  ← Title + close
├─────────────────────────────────────┤
│                                     │
│ Name: [___________________]         │
│                                     │
│ URL:  [___________________]         │
│                                     │
│ [Cancel]              [Create]      │  ← Actions
└─────────────────────────────────────┘
  Glass background, rounded (24px)
  Backdrop: Blurred overlay
  Animation: Slide-up 200ms
```

**Details**:
- Padding: `--spacing-3xl` (32px)
- Border-radius: `--radius-xl` (24px)
- Max-width: 500px (desktop), full (mobile)
- Backdrop: `rgba(0,0,0,0.50)` + `blur(8px)`
- Animation: Slide-up + scale(0.98) entry

---

## Animations

### Micro-interactions

#### Service Card Hover

```
Duration: 350ms (--transition-smooth)
Easing: cubic-bezier(0.34, 1.56, 0.64, 1)

Properties animated:
- transform: translateY(-4px)  ← Lift
- box-shadow: expand           ← Depth
- border-color: brighten       ← Highlight
- icon: scale(1.08x)           ← Icon emphasis
```

#### Nav Item Active

```
Duration: 200ms (--transition-base)
Easing: cubic-bezier(0.4, 0, 0.2, 1)

Properties:
- background: transparent → hsla(..., 0.15)
- border-color: transparent → hsla(..., 0.40)
- box-shadow: none → glow
```

#### Status Dot Online (Pulse Ring)

```
Duration: 2.5s, infinite loop
Easing: ease-out

Keyframes:
0%:   scale(1), opacity(0.30)
100%: scale(2.8), opacity(0)

+ Border pulse (2s, slower than main ring)
```

#### Form Input Focus

```
Duration: 100ms (--transition-fast)
Easing: cubic-bezier(0.4, 0, 0.2, 1)

Properties:
- border-color: transparent → var(--accent)
- box-shadow: none → ring
- background: glass-bg → glass-highlight
```

### Page Transitions

```
Modal entry:
  Overlay: fade-in 200ms
  Content: slide-up 200ms + scale(0.98 → 1)

Page fade:
  Opacity: 0 → 1 over 200ms
```

---

## Color Usage Examples

### By Purpose

| Purpose | Color Variable | Example |
|---------|---|---|
| **Primary Actions** | `var(--accent)` | Button border, active nav, toggle active |
| **Secondary Actions** | `var(--text-secondary)` | Button text (ghost), labels |
| **Disabled/Muted** | `var(--text-muted)` | Placeholder text, disabled inputs |
| **Success Status** | `var(--status-online)` | Online indicator, success messages |
| **Error Status** | `var(--status-offline)` | Offline indicator, delete buttons |
| **Backgrounds** | `var(--glass-bg)` | Card backgrounds, hover states |
| **Borders** | `var(--glass-border)` | Card borders, dividers |
| **Glow Effects** | `var(--accent-glow)` | Box-shadows on hover |
| **Subtle Fills** | `var(--accent-subtle)` | Icon backgrounds, button hover |

---

## Responsive Adjustments

### Mobile (< 768px)
- Sidebar icons only
- Cards: Single column stack
- Buttons: Larger touch targets (44×44px min)
- Modal: Full-screen with padding

### Tablet (768px - 1024px)
- Sidebar visible
- Grid: 2-column layout
- Standard button sizes

### Desktop (> 1024px)
- Full multi-column layouts
- Hover effects enabled
- Dropdown menus
- Advanced interactions

---

## Accessibility Considerations

### Color Alone
- Status indicators include dot shape + position, not just color
- Error messages include text and icon, not just red color

### Keyboard Navigation
- All buttons are focusable with visible focus ring
- Tab order follows logical reading flow
- Escape key closes modals

### Motion
- All animations respect `prefers-reduced-motion`
- Animations disabled → instant state changes
- Functional behavior unchanged

### Contrast
- Primary text: 7:1+ (WCAG AAA)
- Secondary text: 4.5:1+ (WCAG AA)
- Interactive elements: 3:1 minimum

---

**Last Updated**: March 2026
**Component Library Version**: 2.0 (Refined Typography + Enhanced Micro-interactions)
