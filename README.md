# ⬡ HEL Dashboard

A personal homelab dashboard with a clean Liquid Glass design.

Coded by Claude.ai because iam to stupid to code but can wirte prompts lol

## Bug reports, improvements, and feature requests are welcome via issues. :)

## Features

- 🔗 Service link management with online status checks
- 🎨 Light/Dark mode + accent colors (Cyan, Orange, Magenta)
- 💾 SQLite persistence — all data survives container restarts
- 🐳 Single Docker container, minimal footprint
- 🔒 Auth-ready structure (login + OIDC coming in Phase 2)

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

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8282` | Listening port |
| `DATA_DIR` | `/data` | Data directory (mount here) |
| `SECRET_KEY` | — | **Required.** Random secret for session signing |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | `production` | Environment |

## Building

The Docker image is built manually via GitHub Actions:

1. Go to **Actions → Build & Push Docker Image**
2. Click **Run workflow**
3. Enter a tag (e.g. `latest` or `1.0.0`)

## Data Structure

All data is stored under `DATA_DIR`:

```
/data
└── db/
    └── heldash.db    ← SQLite database
```

## Development

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Frontend dev server runs on :5173 and proxies API calls to :8282.

## Roadmap

- [x] Service management + status checks
- [x] Groups / categories
- [x] Light/Dark + accent themes
- [x] Drag & Drop grid layout
- [ ] Local user authentication
- [ ] OIDC via voidauth
- [ ] API integrations (*arr stack, Immich, Emby, Unraid, ...)
- [ ] Widget system
