# CLAUDE.md — HELDASH

Personal homelab dashboard. Shows service tiles with live status indicators, groups them into categories, and lets the user drag-and-drop the layout. Designed for self-hosting on Unraid behind nginx-proxy-manager.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript (strict), Vite 5 |
| State | Zustand |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities |
| Icons | lucide-react |
| Styling | Vanilla CSS (CSS custom properties, glass morphism) |
| Backend | Fastify 4, TypeScript (strict) |
| Database | better-sqlite3 (SQLite, WAL mode) |
| HTTP checks | undici (built-in to Node 18, used for service ping) |
| Container | Docker, single-stage final image (node:20-alpine) |
| Registry | ghcr.io/kreuzbube88/heldash |
| CI | GitHub Actions (workflow_dispatch only) |

---

## Directory Structure

```
heldash/
├── Dockerfile                  # 3-stage: frontend build → backend build → production
├── docker-compose.yml          # Unraid deployment config
├── .github/workflows/
│   └── docker-build.yml        # Manual image build & push to GHCR
├── frontend/
│   ├── index.html              # Sets data-theme="dark" data-accent="cyan" defaults
│   ├── vite.config.ts          # Dev proxy /api + /icons → :8282
│   ├── tsconfig.json           # strict: true, paths: @/* → src/*
│   └── src/
│       ├── main.tsx            # Entry point — just mounts <App />
│       ├── App.tsx             # Root: layout, routing (page state), modals
│       ├── api.ts              # Typed fetch wrapper + all API calls
│       ├── types.ts            # Service, Group, Settings, ThemeMode, ThemeAccent
│       ├── store/
│       │   └── useStore.ts     # Zustand store — single source of truth
│       ├── styles/
│       │   └── global.css      # All CSS: variables, glass, layout, components
│       ├── components/
│       │   ├── Sidebar.tsx     # Left nav (Dashboard / Services / Settings / About)
│       │   ├── Topbar.tsx      # Date, online/offline counters, theme controls, Add
│       │   ├── ServiceCard.tsx # Tile: icon, status dot, hover actions (edit/del/check)
│       │   └── ServiceModal.tsx # Add/edit service form with icon upload
│       └── pages/
│           ├── Dashboard.tsx   # DnD grid of groups + services
│           ├── ServicesPage.tsx # Table view of all services
│           └── Settings.tsx    # Title, theme info, groups, auth placeholder
└── backend/
    ├── tsconfig.json           # strict: true, noEmitOnError: true
    ├── package.json            # build: "tsc" (no || true suppression)
    └── src/
        ├── server.ts           # Fastify setup, middleware, static serving, SPA fallback
        ├── db/
        │   └── database.ts     # Schema, migrations (ALTER TABLE … ADD COLUMN)
        └── routes/
            ├── services.ts     # CRUD + /check + /check-all + /icon upload
            ├── groups.ts       # CRUD for groups
            └── settings.ts     # Key-value settings store
```

---

## Architecture Decisions

### Single-container, no reverse proxy in image
Fastify serves both the API (`/api/*`) and the compiled React SPA (`/public`). Nginx-proxy-manager handles TLS termination externally. No nginx inside the container.

### SQLite over Postgres
Homelab use case — single user, low concurrency. WAL mode for performance. DB file lives in the mounted `/data` volume so it survives container updates.

### No ORM
Raw better-sqlite3 prepared statements. Fast, no abstraction overhead. Row types are defined as TypeScript interfaces (`ServiceRow`, `GroupRow`) and cast with `as ServiceRow | undefined` — the standard pattern since better-sqlite3 can't infer row shape.

### Zustand, not Redux/Context
Single `useStore.ts` exports the entire app state and all actions. Clean API without boilerplate. No selectors needed at this scale.

### CSS custom properties, no Tailwind
Full design system via CSS variables (`--glass-bg`, `--accent`, `--text-primary`, etc.). Theme switching works by changing `data-theme` and `data-accent` on `<html>`. No framework overhead.

### Icon upload via base64 JSON
No multipart/form-data. The frontend reads the file as DataURL, strips the prefix, sends `{ data: string, content_type: string }` as JSON to `POST /api/services/:id/icon`. Backend writes to `DATA_DIR/icons/<id>.<ext>` and stores `/icons/<id>.<ext>` in `icon_url` column.

### Drag & Drop persistence strategy
- Groups: `position` (INTEGER) column, updated via PATCH on drag end
- Services within group: `position_x` (INTEGER) column, updated via PATCH on drag end
- Optimistic update in Zustand store, async PATCH in background
- `position_y` exists in schema (reserved, currently always 0)

### Frontend routing
No React Router. A single `page` state string in `App.tsx` controls which page component is rendered. Adequate for the current page count; add React Router only if deep-linking or nested routes are needed.

---

## Data Model

### services
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| group_id | TEXT | FK → groups.id ON DELETE SET NULL |
| name | TEXT NOT NULL | |
| url | TEXT NOT NULL | Primary service URL |
| icon | TEXT | Emoji character (1–2 chars) |
| icon_url | TEXT | Path to uploaded image (`/icons/<id>.<ext>`) |
| description | TEXT | |
| tags | TEXT | JSON array string, always parsed client-side |
| position_x | INTEGER | Sort order within group (0-based) |
| position_y | INTEGER | Reserved, always 0 |
| width | INTEGER | Reserved, always 1 |
| height | INTEGER | Reserved, always 1 |
| check_enabled | INTEGER | 0/1 — NOT boolean (better-sqlite3 constraint) |
| check_url | TEXT | Override URL for health check; falls back to url |
| check_interval | INTEGER | Seconds (default 60, enforced client-side) |
| last_status | TEXT | 'online' \| 'offline' \| null |
| last_checked | TEXT | ISO datetime string |
| created_at | TEXT | datetime('now') |
| updated_at | TEXT | datetime('now') |

### groups
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| name | TEXT NOT NULL | |
| icon | TEXT | Emoji |
| position | INTEGER | Sort order (0-based) |
| created_at / updated_at | TEXT | |

### settings
Key-value table. Values stored as JSON strings. Current keys:
- `theme_mode` — `"dark"` | `"light"`
- `theme_accent` — `"cyan"` | `"orange"` | `"magenta"`
- `dashboard_title` — string
- `auth_enabled` — boolean
- `auth_mode` — `"none"` | `"local"` | `"oidc"`

---

## API Reference

All routes prefixed `/api`. Frontend uses relative paths (no hardcoded host).

| Method | Path | Description |
|---|---|---|
| GET | /api/services | List all services (ORDER BY position_y, position_x) |
| POST | /api/services | Create service |
| PATCH | /api/services/:id | Update service fields |
| DELETE | /api/services/:id | Delete service + icon file |
| POST | /api/services/:id/check | Trigger manual health check |
| POST | /api/services/check-all | Check all enabled services |
| POST | /api/services/:id/icon | Upload icon (base64 JSON body) |
| GET | /api/groups | List groups (ORDER BY position) |
| POST | /api/groups | Create group |
| PATCH | /api/groups/:id | Update group (COALESCE pattern) |
| DELETE | /api/groups/:id | Delete group |
| GET | /api/settings | Get all settings as flat object |
| PATCH | /api/settings | Upsert settings keys |
| GET | /api/health | `{ status, version, uptime }` |
| GET | /icons/:filename | Serve uploaded icon files |

**Important quirks:**
- `POST /check` and `POST /check-all` require `body: JSON.stringify({})` from the client (Fastify rejects empty JSON bodies without the custom parser in server.ts)
- `check_enabled` must be sent as boolean from client; backend converts to `0/1` for SQLite

---

## Known Constraints & Gotchas

- **better-sqlite3 rejects JS booleans** — Always convert: `check_enabled ? 1 : 0`
- **undici v6 Agent API** — Timeout options go on `new Agent({...})`, not on `request()`. Body must be drained: `for await (const _ of res.body) {}`
- **Self-signed TLS** — `pingAgent` uses `connect: { rejectUnauthorized: false }` — homelabs use self-signed certs on internal services
- **let db!: Database.Database** — Definite assignment assertion required for module-level DB instance with TypeScript strict mode
- **DB migrations** — Use `ALTER TABLE … ADD COLUMN` inside try/catch in `runMigrations()` — silently ignores "column already exists" errors from older DB files
- **Icon paths** — `path.basename()` in the `/icons/:filename` route prevents path traversal attacks
- **Node.js not installed on dev machine** — Cannot run npm/tsc locally; TypeScript errors are caught by CI. Cannot generate package-lock.json locally.

---

## Coding Guidelines

### General
- TypeScript strict mode everywhere — no `as any`, no `Body: any`. Use proper interfaces.
- Keep components small and focused. No god components.
- CSS in `global.css` only — no inline styles except for dynamic values (positioning, colors from JS state).
- Use `lucide-react` for all icons. Keep icon sizes consistent: 16px topbar/sidebar, 14px group headers, 12px card buttons.
- No new dependencies without a clear reason. The stack is intentionally minimal.

### Frontend
- All API calls go through `api.ts` — never call `fetch` directly in components.
- All state mutations go through the Zustand store — never call `api.*` directly in components.
- Optimistic updates for drag-and-drop and other high-frequency interactions. Async persist in background.
- Status "unknown" (no check run yet) = neutral gray dot only — no text, no tooltip.
- Error messages go in `setError()` state → displayed in the modal/form error div.

### Backend
- Define a TypeScript interface for every request body (`CreateXBody`, `PatchXBody`).
- Define a TypeScript interface for every DB row type (`ServiceRow`, `GroupRow`).
- Return `ServiceRow | undefined` from `.get()` — never `unknown` or `any`.
- Use `reply.status(N).send({ error: '...' })` for all error responses.
- HTTP status codes: 400 bad input, 404 not found, 413 too large, 415 unsupported type.
- Clean up related files on DELETE (icon files when deleting a service; old icon when uploading a new one).

### CSS / Theming
- All colors via CSS variables (`var(--text-primary)`, `var(--accent)`, etc.).
- Theme switching: change `data-theme` and `data-accent` on `document.documentElement`.
- `color-scheme: dark/light` is set on each theme block so native browser controls (select, scrollbar) render correctly.
- Glass card pattern: `.glass` class + `backdrop-filter: blur(20px) saturate(180%)`.
- Border radius hierarchy: `--radius-sm` (8px) → `--radius-md` (14px) → `--radius-lg` (20px) → `--radius-xl` (28px).

---

## Deployment Workflow

1. Make changes, commit, push to `main`
2. Go to GitHub → Actions → "Build & Push Docker Image" → Run workflow → enter tag
3. SSH into Unraid: `cd /path/to/heldash && docker compose pull && docker compose up -d`

**Image**: `ghcr.io/kreuzbube88/heldash:<tag>`
**Data volume**: `/mnt/cache/appdata/heldash:/data` (contains `db/heldash.db` and `icons/`)

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| PORT | 8282 | Fastify listen port |
| DATA_DIR | /data | Root for DB and icon files |
| NODE_ENV | production | Enables/disables dev features |
| LOG_LEVEL | info | Pino log level |
| SECRET_KEY | — | Reserved for auth (Phase 2) |

---

## Roadmap

### Phase 1 — Core (current state ✓)
- [x] Service tiles with status indicators (online/offline)
- [x] Automatic + manual health checks via HTTP (undici)
- [x] Service groups with drag-and-drop reordering
- [x] Service drag-and-drop within groups
- [x] Icon upload (PNG/JPG/SVG, max 512 KB)
- [x] Dark/light mode + 3 accent colors (Cyan, Orange, Magenta)
- [x] Dashboard title customization
- [x] Glass morphism design system

### Phase 2 — Auth & Multi-user
- [ ] Local username/password auth
- [ ] OIDC integration (voidauth / Authentik)
- [ ] Role-based access (read-only vs admin)
- [ ] Session management with SECRET_KEY

### Phase 3 — Enhancements
- [ ] package-lock.json committed + Dockerfile switched to `npm ci`
  - Requires: run `npm install` in `frontend/` and `backend/` on a machine with Node.js
- [ ] Custom check intervals per service (backend scheduler, not just frontend polling)
- [ ] Notification webhooks (Gotify / ntfy) on status change
- [ ] Service tags / filtering by tag
- [ ] Cross-group drag-and-drop for services
- [ ] Import/export service list (JSON)
- [ ] Multiple dashboard pages / tabs
