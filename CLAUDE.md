# CLAUDE.md — HELDASH

Personal homelab dashboard. Shows service tiles with live status indicators, groups them into categories, and lets the user drag-and-drop the layout. Includes a Media section for Radarr/Sonarr/Prowlarr/SABnzbd. Designed for self-hosting on Unraid behind nginx-proxy-manager.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript (strict), Vite 5 |
| State | Zustand (two stores: useStore + useArrStore) |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities |
| Icons | lucide-react |
| Styling | Vanilla CSS (CSS custom properties, glass morphism) |
| Backend | Fastify 4, TypeScript (strict) |
| Auth | @fastify/jwt + @fastify/cookie + bcryptjs (cost 12) |
| Database | better-sqlite3 (SQLite, WAL mode) |
| HTTP checks | undici (built-in to Node 18, used for service ping + arr proxy) |
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
│       ├── types.ts            # Service, Group, Settings, AuthUser, UserRecord, UserGroup
│       ├── store/
│       │   ├── useStore.ts     # Main Zustand store: services, groups, settings, auth, users
│       │   └── useArrStore.ts  # Arr/media store: instances, statuses, stats, queues, history
│       ├── styles/
│       │   └── global.css      # All CSS: variables, glass, layout, components
│       ├── components/
│       │   ├── Sidebar.tsx     # Left nav (Dashboard / Services / Media / Settings / About)
│       │   ├── Topbar.tsx      # Date, theme controls, Add App, Add Instance, auth
│       │   ├── ServiceCard.tsx # Tile: icon, status dot, hover actions (edit/del/check)
│       │   ├── ServiceModal.tsx # Add/edit service form with icon upload
│       │   └── LoginModal.tsx  # Login form modal
│       ├── pages/
│       │   ├── Dashboard.tsx   # DnD grid of groups + services
│       │   ├── ServicesPage.tsx # Table view of all services
│       │   ├── Settings.tsx    # Title, theme info, groups, users, user groups, visibility
│       │   ├── MediaPage.tsx   # Arr/media instances (flat DnD grid)
│       │   └── SetupPage.tsx   # First-launch admin account creation
│       └── types/
│           └── arr.ts          # ArrInstance, ArrStats union, SabnzbdStats, queue/history types
└── backend/
    ├── tsconfig.json           # strict: true, noEmitOnError: true
    ├── package.json            # build: "tsc" (no || true suppression)
    └── src/
        ├── server.ts           # Fastify setup, middleware, static serving, SPA fallback
        ├── types.d.ts          # FastifyInstance decorator types (authenticate, requireAdmin)
        ├── db/
        │   └── database.ts     # Schema, migrations (ALTER TABLE … ADD COLUMN)
        ├── arr/
        │   ├── base-client.ts  # ArrBaseClient: undici, shared agent, rejectUnauthorized:false
        │   ├── radarr.ts       # RadarrClient extends ArrBaseClient (v3)
        │   ├── sonarr.ts       # SonarrClient extends ArrBaseClient (v3)
        │   ├── prowlarr.ts     # ProwlarrClient extends ArrBaseClient (v1)
        │   └── sabnzbd.ts      # SabnzbdClient — own undici client, no inheritance
        └── routes/
            ├── services.ts     # CRUD + /check + /check-all + /icon upload
            ├── groups.ts       # CRUD for service groups
            ├── settings.ts     # Key-value settings store
            ├── auth.ts         # /setup, /login, /logout, /status, /me
            ├── users.ts        # User CRUD + user-group CRUD + visibility
            └── arr.ts          # Arr instance CRUD + server-side proxy routes
```

---

## Architecture Decisions

### Single-container, no reverse proxy in image
Fastify serves both the API (`/api/*`) and the compiled React SPA (`/public`). Nginx-proxy-manager handles TLS termination externally. No nginx inside the container.

### SQLite over Postgres
Homelab use case — single user, low concurrency. WAL mode for performance. DB file lives in the mounted `/data` volume so it survives container updates.

### No ORM
Raw better-sqlite3 prepared statements. Fast, no abstraction overhead. Row types are defined as TypeScript interfaces (`ServiceRow`, `GroupRow`) and cast with `as ServiceRow | undefined` — the standard pattern since better-sqlite3 can't infer row shape.

### Auth: JWT in httpOnly cookie
`@fastify/jwt` signs tokens with `SECRET_KEY`. Cookie is `httpOnly`, `sameSite: strict`. Two Fastify decorators: `app.authenticate` (verify JWT, allow request) and `app.requireAdmin` (verify JWT + assert groupId === 'grp_admin'). Public routes: all GETs, `/api/auth/status`, check endpoints.

### Group-based access control
- `grp_admin` — built-in, full access (cannot be deleted)
- `grp_guest` — built-in, read-only
- Custom groups — read-only with per-group visibility control
- Visibility is sparse: `group_service_visibility` and `group_arr_visibility` store only the **hidden** items (presence = hidden)
- Admins always see everything regardless of visibility table

### Two Zustand stores
`useStore` handles the main app (services, groups, settings, auth, users, userGroups). `useArrStore` handles the media section (arr instances, statuses, stats, queues, calendars, indexers, histories). Kept separate to avoid growing the main store with media-specific state.

### CSS custom properties, no Tailwind
Full design system via CSS variables (`--glass-bg`, `--accent`, `--text-primary`, etc.). Theme switching works by changing `data-theme` and `data-accent` on `<html>`. No framework overhead.

### Icon upload via base64 JSON
No multipart/form-data. The frontend reads the file as DataURL, strips the prefix, sends `{ data: string, content_type: string }` as JSON to `POST /api/services/:id/icon`. Backend writes to `DATA_DIR/icons/<id>.<ext>` and stores `/icons/<id>.<ext>` in `icon_url` column.

### Drag & Drop persistence strategy
- Service groups: `position` (INTEGER) column, updated via PATCH on drag end
- Services within group: `position_x` (INTEGER) column, updated via PATCH on drag end
- Arr media instances: `position` (INTEGER) column, updated via PATCH on drag end
- Optimistic update in Zustand store, async PATCH in background
- `position_y` exists in schema (reserved, currently always 0)

### Media integrations: server-side proxy
API keys for Radarr/Sonarr/Prowlarr/SABnzbd are stored in the DB and **never** returned to the frontend (`sanitize()` strips `api_key` before sending). The frontend calls `/api/arr/:id/stats` etc.; the backend fetches from the upstream service using its stored key. Self-signed certs are handled via `rejectUnauthorized: false` in the undici agent.

### SABnzbd client
SABnzbd uses a completely different API structure (single `/api` endpoint, `mode=X&apikey=KEY&output=json` query params). `SabnzbdClient` in `sabnzbd.ts` is a standalone class — it does **not** extend `ArrBaseClient`. All others (Radarr/Sonarr/Prowlarr) extend `ArrBaseClient`.

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

### users
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| username | TEXT UNIQUE NOT NULL | |
| password_hash | TEXT NOT NULL | bcrypt cost 12 |
| first_name | TEXT | |
| last_name | TEXT | |
| email | TEXT | |
| user_group_id | TEXT | FK → user_groups.id |
| is_active | INTEGER | 0/1 |
| last_login | TEXT | ISO datetime |
| oidc_subject | TEXT | Reserved for OIDC |
| oidc_provider | TEXT | Reserved for OIDC |
| created_at / updated_at | TEXT | |

### user_groups
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `grp_admin` / `grp_guest` / nanoid() |
| name | TEXT NOT NULL | |
| description | TEXT | |
| is_system | INTEGER | 0/1 — system groups cannot be deleted |
| created_at / updated_at | TEXT | |

### group_service_visibility
| Column | Type | Notes |
|---|---|---|
| group_id | TEXT | FK → user_groups.id |
| service_id | TEXT | FK → services.id |
| PRIMARY KEY | (group_id, service_id) | Presence = hidden |

### group_arr_visibility
| Column | Type | Notes |
|---|---|---|
| group_id | TEXT | FK → user_groups.id |
| instance_id | TEXT | FK → arr_instances.id |
| PRIMARY KEY | (group_id, instance_id) | Presence = hidden |

### arr_instances
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| type | TEXT NOT NULL | 'radarr' \| 'sonarr' \| 'prowlarr' \| 'sabnzbd' |
| name | TEXT NOT NULL | |
| url | TEXT NOT NULL | Base URL of the service |
| api_key | TEXT NOT NULL | Never returned to frontend |
| enabled | INTEGER | 0/1 |
| position | INTEGER | Sort order in flat grid |
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

### Services
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/services | public | List services (filtered by group visibility) |
| POST | /api/services | authenticate | Create service |
| PATCH | /api/services/:id | authenticate | Update service fields |
| DELETE | /api/services/:id | authenticate | Delete service + icon file |
| POST | /api/services/:id/check | public | Trigger manual health check |
| POST | /api/services/check-all | public | Check all enabled services |
| POST | /api/services/:id/icon | authenticate | Upload icon (base64 JSON body) |

### Groups
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/groups | public | List groups (ORDER BY position) |
| POST | /api/groups | authenticate | Create group |
| PATCH | /api/groups/:id | authenticate | Update group |
| DELETE | /api/groups/:id | authenticate | Delete group |

### Settings
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/settings | public | Get all settings as flat object |
| PATCH | /api/settings | requireAdmin | Upsert settings keys |

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/auth/status | public | `{ needsSetup, user }` |
| POST | /api/auth/setup | public | Create first admin (only if no users exist) |
| POST | /api/auth/login | public | Authenticate, set cookie |
| POST | /api/auth/logout | public | Clear cookie |
| GET | /api/auth/me | authenticate | Current user info |

### Users & Groups
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/users | requireAdmin | List all users |
| POST | /api/users | requireAdmin | Create user |
| PATCH | /api/users/:id | requireAdmin | Update user (incl. password, group) |
| DELETE | /api/users/:id | requireAdmin | Delete user |
| GET | /api/user-groups | requireAdmin | List user groups (incl. hidden_service_ids, hidden_arr_ids) |
| POST | /api/user-groups | requireAdmin | Create user group |
| DELETE | /api/user-groups/:id | requireAdmin | Delete user group (non-system only) |
| PUT | /api/user-groups/:id/visibility | requireAdmin | Set hidden service IDs for group |

### Media (Arr)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/arr/instances | public (filtered) | List instances visible to caller's group |
| POST | /api/arr/instances | requireAdmin | Create instance |
| PATCH | /api/arr/instances/:id | requireAdmin | Update instance |
| DELETE | /api/arr/instances/:id | requireAdmin | Delete instance |
| PUT | /api/arr/groups/:groupId/visibility | requireAdmin | Set hidden instance IDs for group |
| GET | /api/arr/:id/status | public | Online check + version |
| GET | /api/arr/:id/stats | public | Type-specific stats (movie count, queue size, etc.) |
| GET | /api/arr/:id/queue | public | Download queue (Radarr/Sonarr/SABnzbd) |
| GET | /api/arr/:id/calendar | public | Upcoming releases (Radarr/Sonarr only) |
| GET | /api/arr/:id/indexers | public | Indexer list (Prowlarr only) |
| GET | /api/arr/:id/history | public | Download history (SABnzbd only) |

### Misc
| Method | Path | Description |
|---|---|---|
| GET | /api/health | `{ status, version, uptime }` |
| GET | /icons/:filename | Serve uploaded icon files |

**Important quirks:**
- `POST /check` and `POST /check-all` require `body: JSON.stringify({})` from the client (Fastify rejects empty JSON bodies without the custom parser in server.ts)
- `check_enabled` must be sent as boolean from client; backend converts to `0/1` for SQLite
- `sanitize()` in arr.ts strips `api_key` before returning any instance to the client

---

## Known Constraints & Gotchas

- **better-sqlite3 rejects JS booleans** — Always convert: `check_enabled ? 1 : 0`
- **undici v6 Agent API** — Timeout options go on `new Agent({...})`, not on `request()`. Body must be drained: `for await (const _ of res.body) {}`
- **Self-signed TLS** — undici agents use `connect: { rejectUnauthorized: false }` — homelabs use self-signed certs on internal services
- **let db!: Database.Database** — Definite assignment assertion required for module-level DB instance with TypeScript strict mode
- **DB migrations** — Use `ALTER TABLE … ADD COLUMN` inside try/catch in `runMigrations()` — silently ignores "column already exists" errors from older DB files
- **Icon paths** — `path.basename()` in the `/icons/:filename` route prevents path traversal attacks
- **Node.js not installed on dev machine** — Cannot run npm/tsc locally; TypeScript errors are caught by CI. Cannot generate package-lock.json locally.
- **JWT secret** — `SECRET_KEY` env var required in production. Falls back to an insecure default in development (logged as a warning).
- **Sonarr calendar** — Requires `includeSeries=true` query param, otherwise `series` is undefined on episode objects.
- **SABnzbd API** — Single `/api` endpoint, `mode=X&apikey=KEY&output=json`. `SabnzbdClient` does NOT extend `ArrBaseClient`.
- **Healthcheck** — Uses `127.0.0.1` not `localhost` to avoid IPv6 resolution issues in Docker.
- **callerGroupId()** — Helper in arr.ts that tries jwtVerify and falls back to `'grp_guest'` — allows public read access without hard-requiring auth on every proxy route.

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
- `useStore` = app state; `useArrStore` = media state. Keep them separate.

### Backend
- Define a TypeScript interface for every request body (`CreateXBody`, `PatchXBody`).
- Define a TypeScript interface for every DB row type (`ServiceRow`, `GroupRow`, `ArrInstanceRow`).
- Return `RowType | undefined` from `.get()` — never `unknown` or `any`.
- Use `reply.status(N).send({ error: '...' })` for all error responses.
- HTTP status codes: 400 bad input, 404 not found, 413 too large, 415 unsupported type.
- Clean up related files on DELETE (icon files when deleting a service; old icon when uploading a new one).
- Never expose `api_key` or `password_hash` in API responses — always strip before sending.

### CSS / Theming
- All colors via CSS variables (`var(--text-primary)`, `var(--accent)`, etc.).
- Theme switching: change `data-theme` and `data-accent` on `document.documentElement`.
- `color-scheme: dark/light` is set on each theme block so native browser controls (select, scrollbar) render correctly.
- Glass card pattern: `.glass` class + `backdrop-filter: blur(20px) saturate(180%)`.
- Border radius hierarchy: `--radius-sm` (8px) → `--radius-md` (14px) → `--radius-lg` (20px) → `--radius-xl` (28px).
- `btn-primary`: outline style — `background: transparent; color: var(--accent); border-color: var(--accent)`. No filled background.

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
| SECRET_KEY | — | **Required.** JWT signing secret. Falls back to insecure default if unset. |

---

## Roadmap

### Phase 1 — Core ✓
- [x] Service tiles with status indicators (online/offline)
- [x] Automatic + manual health checks via HTTP (undici)
- [x] Service groups with drag-and-drop reordering
- [x] Service drag-and-drop within groups
- [x] Icon upload (PNG/JPG/SVG, max 512 KB)
- [x] Dark/light mode + 3 accent colors (Cyan, Orange, Magenta)
- [x] Dashboard title customization
- [x] Glass morphism design system

### Phase 2 — Auth & Multi-user ✓
- [x] Local username/password auth (bcrypt + JWT httpOnly cookie)
- [x] First-launch setup page (create admin account)
- [x] Group-based access control (grp_admin = full access, others = read-only)
- [x] Custom user groups with per-group app/media visibility
- [x] User management (CRUD, password reset, group assignment)
- [x] Guest theme customization via localStorage
- [ ] OIDC integration (voidauth / Authentik) — user model is OIDC-ready

### Phase 3 — Media Integrations ✓
- [x] Radarr integration (movie stats, queue, calendar)
- [x] Sonarr integration (series stats, queue, calendar)
- [x] Prowlarr integration (indexer list + grab stats)
- [x] SABnzbd integration (queue with progress, download history)
- [x] Server-side proxy (API keys never reach the browser)
- [x] Per-group media visibility
- [x] Drag-and-drop reordering of media instances

### Phase 4 — Enhancements
- [ ] package-lock.json committed + Dockerfile switched to `npm ci`
  - Requires: run `npm install` in `frontend/` and `backend/` on a machine with Node.js
- [ ] Custom check intervals per service (backend scheduler, not just frontend polling)
- [ ] Notification webhooks (Gotify / ntfy) on status change
- [ ] Service tags / filtering by tag
- [ ] Cross-group drag-and-drop for services
- [ ] Import/export service list (JSON)
- [ ] Multiple dashboard pages / tabs
- [ ] More integrations (Immich, Emby/Jellyfin, Unraid system stats, ...)
