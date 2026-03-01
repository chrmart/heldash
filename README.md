# HELDASH

A personal homelab dashboard with a clean glass morphism design.

Coded by Claude.ai because iam to stupid to code but can wirte prompts lol

## Bug reports, improvements, and feature requests are welcome via issues. :)

## Features

**Dashboard**
- 🔗 Service/app link management with live online/offline status monitoring
- 🗂️ Groups / categories for organizing apps
- 🖱️ Drag & Drop reordering for apps and groups
- 🖼️ Custom icons (PNG/JPG/SVG upload or emoji)

**Media**
- 🎬 Radarr — movie stats, download queue, upcoming calendar
- 📺 Sonarr — series stats, download queue, upcoming calendar
- 🔍 Prowlarr — indexer list and 24h grab stats
- ⬇️ SABnzbd — queue with progress bars, download history
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
  -e SECRET_KEY=your_random_secret_here \
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

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8282` | Listening port |
| `DATA_DIR` | `/data` | Data directory (mount here) |
| `SECRET_KEY` | — | **Required.** Secret for JWT signing. Uses insecure default if unset. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | `production` | Environment |

---

## Building

The Docker image is built manually via GitHub Actions:

1. Go to **Actions → Build & Push Docker Image**
2. Click **Run workflow**
3. Enter a tag (e.g. `latest` or `1.0.0`)

---

## Data Structure

All data is stored under `DATA_DIR`:

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
- [ ] OIDC via voidauth
- [ ] Notification webhooks (Gotify / ntfy)
- [ ] More integrations (Immich, Jellyfin, Unraid system stats, ...)
- [ ] Widget system
