# HELDASH

A personal homelab dashboard with a clean glass morphism design.

Coded by Claude.ai because iam to stupid to code but can wirte prompts lol

## Bug reports, improvements, and feature requests are welcome via issues. :)

---

## Features

**Dashboard**
- 🗂️ Modular overview grid — freely arrange apps, media instances, and widgets independent of group structure
- 📏 **Smart Grid Layout** — 20-column grid supporting up to **10 apps per row**
  - Apps: 2 columns wide (1×1 base size)
  - Widgets: 4 columns wide, 2 rows tall (2×2 size) — twice the size of apps
  - Next to a widget, 2 apps can fit vertically
  - Settings: choose 2–10 apps per row layout
- 📦 **Dashboard Groups** — named containers for organizing dashboard items
  - Configurable widths (25%, 33%, 50%, 66%, 100% of dashboard)
  - Drag-and-drop reordering of groups and items within groups
  - Double-click group names to edit, delete groups (items become ungrouped)
  - Per-user group configurations
- ✅ **Dashboard & Health Check Toggles** — one-click controls on Apps page
  - Dashboard toggle: quickly add/remove apps from dashboard
  - Health Check toggle: enable/disable status monitoring
  - Real-time visual feedback (accent colors)
- 🖱️ Edit mode — drag & drop reordering of all dashboard items and groups
- 📐 Placeholder cards (App / Widget / Row) — reserve space and structure rows in edit mode
- 👥 Per-user dashboards — each user arranges their own dashboard; guests share a common layout set by admins
- 🔗 App cards link directly to the service URL
- 🔴 Live online/offline status dots on every app card

**Apps**
- 📋 Full app list grouped by category with group headers
- ➕ Add, edit, delete apps with icon (PNG/JPG/SVG upload or emoji)
- 🔁 Automatic and manual health checks via HTTP
- 🏷️ Tags and description per app

**Media**
- 🎬 Radarr — movie stats, download queue, upcoming calendar
- 📺 Sonarr — series stats, download queue, upcoming calendar
- 🔍 Prowlarr — indexer list and 24h grab stats
- ⬇️ SABnzbd — queue with progress bars, download history
- 🖼️ Media cards inherit the icon from a matching app (matched by URL)
- 🔒 API keys stored server-side only — never exposed to the browser

**Seerr / Discover**
- 🔎 **Discover tab** — browse trending movies and TV shows, search by title
- 🎛️ Advanced filters — genre, streaming service (with logos), language, rating, release year
- 📺 Real season selection — shows actual available / pending / missing seasons per series
- 📥 Request movies and individual seasons directly from the dashboard
- 🟢 Smart request button — shows availability status (Available / Pending / Request missing seasons)
- ➕ Pagination — load more results inline

**Docker**
- 🐳 Docker page — live container list with CPU/RAM stats, state badges, and uptime
- 📋 Sortable container table (click column headers: name, image, status, uptime, CPU/memory)
- 📊 Overview bar — Total / Running / Stopped / Restarting counts at a glance
- 📜 Live log streaming per container via SSE (stdout + stderr, filter, reconnect)
- ▶️ Start / Stop / Restart containers directly from the dashboard (admin-only)
- 🔒 Per-group Docker page access — disabled by default, enabled per group by an admin

**Home Assistant**
- 🏠 Dedicated **Home Assistant** page — multi-instance support (add/edit/delete/test)
- 🔍 Entity browser — loads all states from HA, grouped by domain with search filter
- 🃏 Panel grid — entity cards with real-time WebSocket updates, drag-and-drop reorder
- 🔘 Toggle support — light, switch, input_boolean, automation, fan, media_player
- 📡 State colors — on/open/unlocked/playing/home/active = green; off/closed/locked/… = gray
- 🔒 Long-Lived Access Tokens stored server-side only — never exposed to the browser
- 🏷️ Custom labels per panel — falls back to HA `friendly_name` → `entity_id`

**Widgets**
- 🖥️ Server Status — live CPU, RAM, and disk usage with progress bars (Linux hosts)
- 🛡️ AdGuard Home — DNS query stats, block rate, protection toggle (admin-only)
- 🐳 Docker Overview — container counts + Start/Stop/Restart dropdown (admin-only)
- 🔐 **Nginx Proxy Manager** — active proxies, certificate counts, expiry alerts
  - Token-based authentication (username + password)
  - Monitors proxy host status and SSL certificate health
  - Alerts for expired and soon-to-expire certificates
- 🏠 **Home Assistant Widget** — entity states in topbar/sidebar/dashboard
- 📊 Widgets can be pinned to the topbar for at-a-glance stats
- 🔒 Widget credentials stored server-side only — never exposed to the browser
- 🔒 Docker Overview widget access is controlled per group separately from the Docker page

**Auth & Access**
- 🔑 Local user authentication — admin setup on first launch
- 👥 User groups (Admin, Guest + custom)
- 👁️ Per-group visibility control for apps, media instances, and widgets
- 🐳 Per-group Docker permissions — Docker page and Docker Overview widget enabled independently
- 🎨 Guests can change theme locally (dark/light + accent color)
- 🛠️ Admin "Guest Mode" — admins can switch to the guest view to set up the guest dashboard

**Settings**
- 🗂️ Tabbed settings page: General, Users, Groups, OIDC/SSO
- 👤 User management (create, edit, deactivate, delete users)
- 🔐 Group permissions editor with tabs: Apps · Media · Widgets · Docker · Background
- 🖼️ Background images — upload custom backgrounds (PNG/JPG/SVG/WebP, max 5 MB), assign one per user group
- 🔐 OIDC/SSO configuration UI prepared (coming in a future release)

**Design & Accessibility** (v2.0 Refined)
- 🎨 **Typography**: Geist (body) + Space Mono (display) — distinctive, modern
- ♿ **Full Accessibility**: `prefers-reduced-motion` compliance, WCAG AA+ contrast ratios
- 🌓 **Themes**: Light/Dark mode + 3 accent colors (Cyan, Orange, Magenta)
- 🕐 **Auto Theme** — automatically switches between light and dark mode on a configurable time schedule (e.g. light from 08:00, dark from 20:00)
- ✨ **Micro-interactions**: Cubic-bezier easing (smooth, bounce), strategic animations
- 🎯 **Sidebar**: Gradient hover overlay, active state with glow, 2px translate
- 💫 **Status Indicators**: Online (dual-pulse ring + border), Offline (breathing), Unknown (static)
- 📏 **Spacing Grid**: Consistent 8px base (`--spacing-xs` to `--spacing-3xl`)
- 🌟 **Dark Mode**: Per-accent accent-subtle boost (12% opacity), icon backgrounds (15%)

**Import/Export & Management**
- 📥 **JSON Import/Export** — backup and restore service configurations
  - Export all services as JSON file (admin-only)
  - Import services from JSON with duplicate detection
  - Perfect for migrations and backups

**General**
- 💾 SQLite persistence — all data survives container restarts
- 🐳 Single Docker container, minimal footprint
- 🔑 OIDC-ready user model (voidauth integration coming later)

---

## Quick Start

```bash
docker run -d \
  --name heldash \
  -p 8282:8282 \
  -v /mnt/cache/appdata/heldash:/data \
  -e SECRET_KEY=$(openssl rand -hex 32) \
  -e SECURE_COOKIES=false \
  ghcr.io/kreuzbube88/heldash:latest
```

Or with docker-compose:

```bash
docker compose up -d
```

Then open **http://your-server:8282**

On first launch you will be prompted to create an admin account.

---

## Authentication

- **First launch:** A setup page appears to create the admin user
- **Public access:** The dashboard is readable without logging in
- **Admin login:** Required to add, edit, delete apps/groups/instances and manage users
- **User groups:** Admin and Guest are built-in; admins can create additional groups
- **Visibility:** Admins can control per group which apps, media instances, and widgets are visible
- **Per-user dashboards:** Each logged-in user configures their own dashboard layout; the guest dashboard is managed by admins via "Guest Mode"
- **OIDC preparation:** User records include email, first/last name, and OIDC fields

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SECRET_KEY` | **Yes** | insecure fallback | Secret for JWT signing. Generate with: `openssl rand -hex 32` |
| `SECURE_COOKIES` | **Yes** | `false` | `false` = HTTP (direct LAN), `true` = HTTPS (behind nginx-proxy-manager with SSL) |
| `LOG_LEVEL` | No | `info` | `debug` · `info` · `warn` · `error` |
| `LOG_FORMAT` | No | `pretty` | `pretty` = human-readable colorized output (default). `json` = raw JSON for log aggregators (Loki, Graylog, etc.) |

---

## Unraid

A ready-to-use Community Applications template is included: **`heldash.xml`**

Import it via Community Applications → Import to get a pre-filled container setup with all fields and descriptions.

---

## Roadmap

- [x] App management + status checks
- [x] Groups / categories
- [x] Light/Dark + accent themes
- [x] Auto Theme — time-based light/dark switching
- [x] Drag & Drop reordering
- [x] Local user authentication
- [x] User groups (Admin, Guest, custom)
- [x] Per-group app, media, and widget visibility
- [x] Radarr / Sonarr / Prowlarr integration
- [x] SABnzbd integration
- [x] Modular dashboard (free arrangement, independent of groups)
- [x] Edit mode with drag & drop and placeholder cards
- [x] "Show on Dashboard" toggle per app and instance
- [x] Per-user dashboards with admin-managed guest dashboard
- [x] Widget system (Server Status, AdGuard Home, Docker Overview)
- [x] Topbar widget stats
- [x] Tabbed settings page (General, Users, Groups, OIDC/SSO)
- [x] Docker page — live container stats, log streaming, start/stop/restart
- [x] Per-group Docker permissions (page access + widget access)
- [x] Background images — upload and assign per user group
- [x] **UI/UX Refinement** — distinctive typography, refined glass morphism, micro-interactions
  - [x] Geist + Space Mono typography system
  - [x] Consistent 8px spacing grid
  - [x] Sidebar navigation with glow effects
  - [x] Enhanced status indicator animations (dual-pulse)
  - [x] Dark mode accent color optimizations
  - [x] Prefers-reduced-motion accessibility support
- [x] **Import/Export Services** — JSON backup/restore for migrations
- [x] **Nginx Proxy Manager Widget** — monitor proxies, certificates, expiry alerts
- [x] **Smart Dashboard Grid** — 20-column layout, 10 apps per row, widgets 2×2 sized
- [x] **Services Page Toggles** — one-click dashboard add/remove and health check toggle
- [x] **Home Assistant Integration** — multi-instance, entity browser, panel grid, real-time WebSocket state updates, toggle support
- [x] **Seerr / Discover** — media request management, trending browse, advanced filters, season selection, smart request button
- [ ] OIDC / SSO via voidauth or Authentik (UI prepared)
- [ ] Torrent Client Integration (qBittorrent, Transmission, Deluge)
- [ ] More integrations (Immich, Jellyfin, Emby, etc.)
