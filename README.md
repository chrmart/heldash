# HELDASH

A personal homelab dashboard with a clean glass morphism design.

Coded by Claude.ai because iam to stupid to code but can wirte prompts lol

## Bug reports, improvements, and feature requests are welcome via issues. :)

---

## Features

**Dashboard**
- 🗂️ Modular overview grid — freely arrange apps and media instances independent of group structure
- ✅ Per-app and per-instance toggle to show on dashboard ("Show on Dashboard")
- 🖱️ Edit mode — drag & drop reordering of all dashboard items
- 📐 Placeholder cards (App / Instance / Row) — reserve space and structure rows in edit mode
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

**Auth & Access**
- 🔑 Local user authentication — admin setup on first launch
- 👥 User groups (Admin, Guest + custom)
- 👁️ Per-group visibility control for apps and media instances
- 🎨 Guests can change theme locally (dark/light + accent color)

**General**
- 🌓 Light/Dark mode + 3 accent colors (Cyan, Orange, Magenta)
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
- **Visibility:** Admins can control per group which apps and media instances are visible
- **OIDC preparation:** User records include email, first/last name, and OIDC fields

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SECRET_KEY` | **Yes** | insecure fallback | Secret for JWT signing. Generate with: `openssl rand -hex 32` |
| `SECURE_COOKIES` | **Yes** | `false` | `false` = HTTP (direct LAN), `true` = HTTPS (behind nginx-proxy-manager with SSL) |
| `LOG_LEVEL` | No | `info` | `debug` · `info` · `warn` · `error` |

---

## Unraid

A ready-to-use Community Applications template is included: **`heldash.xml`**

Import it via Community Applications → Import to get a pre-filled container setup with all fields and descriptions.

---

## Building

Two GitHub Actions workflows are available (both manual trigger only):

| Workflow | Tags pushed | Use case |
|---|---|---|
| **Release Latest** | `:latest` + `:1.0.0` (version input) | Production release |
| **Build & Push Docker Image** | Custom tag only (e.g. `:test-feature`) | Testing & development builds |

---

## Data Structure

All data is stored under `/data` (mount a host path here):

```
/data
├── db/
│   └── heldash.db    ← SQLite database
└── icons/
    └── *.png/jpg/svg ← Uploaded app icons
```

---

## Development

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Frontend dev server runs on :5173 and proxies `/api` and `/icons` calls to :8282.

---

## Roadmap

- [x] App management + status checks
- [x] Groups / categories
- [x] Light/Dark + accent themes
- [x] Drag & Drop reordering
- [x] Local user authentication
- [x] User groups (Admin, Guest, custom)
- [x] Per-group app and media visibility
- [x] Radarr / Sonarr / Prowlarr integration
- [x] SABnzbd integration
- [x] Modular dashboard (free arrangement, independent of groups)
- [x] Edit mode with drag & drop and placeholder cards
- [x] "Show on Dashboard" toggle per app and instance
- [ ] OIDC via voidauth
- [ ] Notification webhooks (Gotify / ntfy)
- [ ] More integrations (Immich, Jellyfin, Unraid system stats, ...)
- [ ] Widget system
