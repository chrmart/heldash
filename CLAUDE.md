# CLAUDE.md — HELDASH

Personal homelab dashboard. Shows service tiles with live status indicators, groups them into categories, and lets the user drag-and-drop the layout. Includes a Media section for Radarr/Sonarr/Prowlarr/SABnzbd, a Docker page for live container management, and a Widget system for at-a-glance system stats. Designed for self-hosting on Unraid behind nginx-proxy-manager.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript (strict), Vite 5 |
| State | Zustand (useStore + useArrStore + useDockerStore + useWidgetStore + useDashboardStore) |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities |
| Icons | lucide-react |
| Styling | Vanilla CSS (CSS custom properties, glass morphism) |
| Backend | Fastify 4, TypeScript (strict) |
| Auth | @fastify/jwt + @fastify/cookie + bcryptjs (cost 12) |
| Database | better-sqlite3 (SQLite, WAL mode) |
| HTTP checks | undici Pool (service ping, arr proxy, Docker socket) |
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
│       ├── types.ts            # Service, Group, Settings, AuthUser, UserRecord, UserGroup, Widget, DockerContainer, ...
│       ├── store/
│       │   ├── useStore.ts        # Main store: services, groups, settings, auth, users, userGroups
│       │   ├── useArrStore.ts     # Media store: instances, statuses, stats, queues, histories
│       │   ├── useDockerStore.ts  # Docker store: containers, stats, control
│       │   ├── useWidgetStore.ts  # Widget store: widgets, stats, AdGuard toggle
│       │   └── useDashboardStore.ts # Dashboard item store
│       ├── styles/
│       │   └── global.css      # All CSS: variables, glass, layout, components
│       ├── components/
│       │   ├── Sidebar.tsx     # Left nav (Dashboard / Apps / Media / Docker / Widgets / Settings / About)
│       │   ├── Topbar.tsx      # Date, theme controls, Add buttons, auth, topbar widget stats
│       │   ├── ServiceCard.tsx # Tile: icon, status dot, hover actions
│       │   ├── ServiceModal.tsx # Add/edit service form with icon upload
│       │   └── LoginModal.tsx  # Login form modal
│       ├── pages/
│       │   ├── Dashboard.tsx   # DnD grid: services, arr instances, widgets, placeholders
│       │   ├── ServicesPage.tsx # Table view of all services (fixed-width columns via colgroup)
│       │   ├── Settings.tsx    # Tabbed: General, Users, Groups (Apps/Media/Widgets/Docker tabs), OIDC
│       │   ├── MediaPage.tsx   # Arr/media instances (flat DnD grid)
│       │   ├── DockerPage.tsx  # Docker containers: overview bar, sortable table, log viewer
│       │   ├── WidgetsPage.tsx # Widget management + DockerOverviewContent (exported, reused by Dashboard)
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
            ├── users.ts        # User CRUD + user-group CRUD + visibility endpoints
            ├── arr.ts          # Arr instance CRUD + server-side proxy routes
            ├── widgets.ts      # Widget CRUD + stats endpoints + icon upload
            ├── dashboard.ts    # Dashboard item management (ordered list, per-owner)
            └── docker.ts       # Docker Engine API proxy (containers, stats, logs SSE, control)
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
`@fastify/jwt` signs tokens with `SECRET_KEY`. Cookie is `httpOnly`, `sameSite: strict`. Two Fastify decorators: `app.authenticate` (verify JWT) and `app.requireAdmin` (verify JWT + assert groupId === 'grp_admin'). Public routes: all GETs, `/api/auth/status`, check endpoints.

### Group-based access control
- `grp_admin` — built-in, full access, always has Docker + Docker widget access (cannot be deleted)
- `grp_guest` — built-in, read-only, no Docker or Docker widget access by default
- Custom groups — read-only with per-group visibility; Docker page and Docker widget access enabled independently by admin
- Visibility is sparse: junction tables store only the **hidden** items (presence = hidden)
- `docker_overview` widgets bypass `group_widget_visibility` — instead filtered by `docker_widget_access` column on `user_groups`

### Docker Engine API proxy
`docker.ts` connects to `/var/run/docker.sock` via `undici.Pool` (10 connections) so batch stats requests run concurrently. Access controlled by `hasDockerAccess()` (checks `docker_access` column on user's group). SSE log streaming uses `reply.hijack()` called **before** the Docker API request so the SSE connection opens immediately; errors are sent as SSE events.

### Widget system
Three widget types: `server_status`, `adguard_home`, `docker_overview`. Widget credentials (AdGuard password) are stripped in `sanitize()` before returning to the frontend — stored server-side only. `docker_overview` widgets have a separate access gate (`docker_widget_access`) and never appear in `group_widget_visibility`.

### Multiple Zustand stores
- `useStore` — main app (services, groups, settings, auth, users, userGroups)
- `useArrStore` — media (arr instances, statuses, stats, queues, calendars, indexers, histories)
- `useDockerStore` — Docker (containers list, stats map, control action)
- `useWidgetStore` — widgets (widget list, stats cache, AdGuard toggle)
- `useDashboardStore` — dashboard items (ordered list, add/remove/reorder)

### CSS custom properties, no Tailwind
Full design system via CSS variables (`--glass-bg`, `--accent`, `--text-primary`, etc.). Theme switching works by changing `data-theme` and `data-accent` on `<html>`. No framework overhead.

### Icon upload via base64 JSON
No multipart/form-data. Frontend reads the file as DataURL, strips prefix, sends `{ data: string, content_type: string }` as JSON. Backend writes to `DATA_DIR/icons/<id>.<ext>` and stores `/icons/<id>.<ext>` in `icon_url` column.

### Drag & Drop persistence strategy
- Service groups: `position` column, PATCH on drag end
- Services within group: `position_x` column, PATCH on drag end
- Arr media instances: `position` column, PATCH on drag end
- Dashboard items: `position` column in `dashboard_items`, PATCH `/api/dashboard/reorder`
- Optimistic update in Zustand store, async persist in background

### ServicesPage column alignment
Uses `table-layout: fixed` + `<colgroup>` with percentage widths so every group table has identical column proportions regardless of content. Long URLs are clipped with `text-overflow: ellipsis`.

### Media integrations: server-side proxy
API keys for Radarr/Sonarr/Prowlarr/SABnzbd are stored in the DB and **never** returned to the frontend (`sanitize()` strips `api_key`). Self-signed certs handled via `rejectUnauthorized: false` in the undici agent.

### SABnzbd client
Uses a single `/api` endpoint with `mode=X&apikey=KEY&output=json`. `SabnzbdClient` does **not** extend `ArrBaseClient`.

### Frontend routing
No React Router. A single `page` state string in `App.tsx` controls which page component renders.

---

## Data Model

### services
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| group_id | TEXT | FK → groups.id ON DELETE SET NULL |
| name | TEXT NOT NULL | |
| url | TEXT NOT NULL | Primary service URL |
| icon | TEXT | Emoji character |
| icon_url | TEXT | `/icons/<id>.<ext>` |
| description | TEXT | |
| tags | TEXT | JSON array string |
| position_x | INTEGER | Sort order within group |
| check_enabled | INTEGER | 0/1 |
| check_url | TEXT | Override URL for health check |
| check_interval | INTEGER | Seconds (default 60) |
| last_status | TEXT | 'online' \| 'offline' \| null |
| last_checked | TEXT | ISO datetime |
| created_at / updated_at | TEXT | |

### groups
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| name | TEXT NOT NULL | |
| icon | TEXT | Emoji |
| position | INTEGER | Sort order |
| created_at / updated_at | TEXT | |

### users
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| username | TEXT UNIQUE NOT NULL | |
| password_hash | TEXT | bcrypt cost 12 |
| first_name / last_name / email | TEXT | |
| user_group_id | TEXT | FK → user_groups.id |
| is_active | INTEGER | 0/1 |
| last_login | TEXT | ISO datetime |
| oidc_subject / oidc_provider | TEXT | Reserved for OIDC |
| created_at / updated_at | TEXT | |

### user_groups
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | `grp_admin` / `grp_guest` / nanoid() |
| name | TEXT NOT NULL | |
| description | TEXT | |
| is_system | INTEGER | 0/1 — system groups cannot be deleted |
| docker_access | INTEGER | 0/1 — Docker page visible in sidebar |
| docker_widget_access | INTEGER | 0/1 — Docker Overview widgets visible |
| created_at | TEXT | |

### group_service_visibility / group_arr_visibility / group_widget_visibility
Sparse junction tables: presence of a row means the item is **hidden** for that group. `docker_overview` widgets bypass `group_widget_visibility` and use `user_groups.docker_widget_access` instead.

### arr_instances
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| type | TEXT | 'radarr' \| 'sonarr' \| 'prowlarr' \| 'sabnzbd' |
| name / url | TEXT NOT NULL | |
| api_key | TEXT NOT NULL | Never returned to frontend |
| enabled | INTEGER | 0/1 |
| position | INTEGER | Sort order |
| created_at / updated_at | TEXT | |

### widgets
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| type | TEXT | 'server_status' \| 'adguard_home' \| 'docker_overview' |
| name | TEXT NOT NULL | |
| config | TEXT | JSON — AdGuard password stripped before sending to frontend |
| position | INTEGER | |
| show_in_topbar | INTEGER | 0/1 |
| icon_url | TEXT | Custom icon (docker_overview falls back to Container lucide icon) |
| created_at / updated_at | TEXT | |

### dashboard_items
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| type | TEXT | 'service' \| 'arr_instance' \| 'widget' \| 'placeholder*' |
| ref_id | TEXT | NULL for placeholders |
| position | INTEGER | |
| owner_id | TEXT | user sub or 'guest' |
| created_at | TEXT | |

### settings
Key-value table. Values stored as JSON strings. Keys: `theme_mode`, `theme_accent`, `dashboard_title`, `auth_enabled`, `auth_mode`.

---

## API Reference

All routes prefixed `/api`. Frontend uses relative paths.

### Services
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/services | public | List (filtered by group visibility) |
| POST | /api/services | authenticate | Create |
| PATCH | /api/services/:id | authenticate | Update fields |
| DELETE | /api/services/:id | authenticate | Delete + icon file |
| POST | /api/services/:id/check | public | Manual health check |
| POST | /api/services/check-all | public | Check all enabled |
| POST | /api/services/:id/icon | authenticate | Upload icon (base64 JSON) |

### Groups / Settings / Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| GET/POST/PATCH/DELETE | /api/groups | authenticate | CRUD for service groups |
| GET | /api/settings | public | All settings |
| PATCH | /api/settings | requireAdmin | Upsert settings |
| GET | /api/auth/status | public | `{ needsSetup, user }` |
| POST | /api/auth/setup | public | Create first admin |
| POST | /api/auth/login | public | Authenticate, set cookie |
| POST | /api/auth/logout | public | Clear cookie |
| GET | /api/auth/me | authenticate | Current user |

### Users & User Groups
| Method | Path | Auth | Description |
|---|---|---|---|
| GET/POST/PATCH/DELETE | /api/users | requireAdmin | User CRUD |
| GET/POST/DELETE | /api/user-groups | requireAdmin | User group CRUD |
| PUT | /api/user-groups/:id/visibility | requireAdmin | Set hidden service IDs |
| PUT | /api/user-groups/:id/arr-visibility | requireAdmin | Set hidden arr instance IDs |
| PUT | /api/user-groups/:id/widget-visibility | requireAdmin | Set hidden widget IDs (non-docker only) |
| PUT | /api/user-groups/:id/docker-access | requireAdmin | Toggle Docker page access |
| PUT | /api/user-groups/:id/docker-widget-access | requireAdmin | Toggle Docker widget access |

### Widgets
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/widgets | public (filtered) | List widgets visible to caller |
| POST | /api/widgets | requireAdmin | Create widget |
| PATCH | /api/widgets/:id | requireAdmin | Update widget |
| DELETE | /api/widgets/:id | requireAdmin | Delete + icon file |
| GET | /api/widgets/:id/stats | public | Live stats (server_status / adguard_home; `{}` for docker_overview) |
| POST | /api/widgets/:id/icon | requireAdmin | Upload custom icon |
| POST | /api/widgets/:id/adguard/protection | requireAdmin | Toggle AdGuard protection |

### Dashboard
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/dashboard | public | Ordered items with embedded data, filtered by owner + group visibility |
| POST | /api/dashboard/items | authenticate | Add item |
| DELETE | /api/dashboard/items/:id | authenticate | Remove item |
| DELETE | /api/dashboard/items/by-ref | authenticate | Remove by type + ref_id |
| PATCH | /api/dashboard/reorder | authenticate | Bulk position update |

### Docker
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/docker/containers | docker_access | List all containers |
| GET | /api/docker/containers/:id/stats | docker_access | One-shot CPU + RAM stats |
| GET | /api/docker/stats | docker_access | Batch stats for all running containers |
| GET | /api/docker/containers/:id/logs | docker_access | SSE log stream (stdout + stderr) |
| POST | /api/docker/containers/:id/start | requireAdmin | Start container |
| POST | /api/docker/containers/:id/stop | requireAdmin | Stop container |
| POST | /api/docker/containers/:id/restart | requireAdmin | Restart container |

### Misc
| Method | Path | Description |
|---|---|---|
| GET | /api/health | `{ status, version, uptime }` |
| GET | /api/time | `{ iso }` — server time |
| GET | /icons/:filename | Serve uploaded icons |

---

## Known Constraints & Gotchas

- **better-sqlite3 rejects JS booleans** — Always convert: `check_enabled ? 1 : 0`
- **undici Pool for Docker** — `new Pool('http://localhost', { socketPath: '/var/run/docker.sock', connections: 10 })`. Pool allows concurrent batch stats requests. Do NOT use `undici.Client` (single connection = serialized requests = N × 1s delay for stats).
- **SSE log stream** — `reply.hijack()` must be called **before** the Docker API request so the SSE connection opens immediately. After hijack, errors must be sent as SSE events (cannot use `reply.status()` anymore).
- **Docker log multiplexing** — Non-TTY containers prefix each frame with an 8-byte header: `[stream_type(1)][reserved(3)][size(4 big-endian)]`. TTY containers send raw text. Detection: first byte is `0x01` or `0x02` = muxed.
- **Self-signed TLS** — undici agents use `connect: { rejectUnauthorized: false }` — homelabs use self-signed certs.
- **let db!: Database.Database** — Definite assignment assertion required for module-level DB instance with TypeScript strict mode.
- **DB migrations** — `ALTER TABLE … ADD COLUMN` inside try/catch in `runMigrations()` — silently ignores "column already exists" on old DB files.
- **Icon paths** — `path.basename()` in the `/icons/:filename` route prevents path traversal attacks.
- **Node.js not installed on dev machine** — Cannot run npm/tsc locally; TypeScript errors caught by CI only.
- **JWT secret** — `SECRET_KEY` env var required. Falls back to insecure default in dev (logged as warning).
- **Sonarr calendar** — Requires `includeSeries=true`, otherwise `series` is undefined on episode objects.
- **SABnzbd API** — Single `/api` endpoint, `mode=X&apikey=KEY&output=json`. `SabnzbdClient` does NOT extend `ArrBaseClient`.
- **Healthcheck** — Uses `127.0.0.1` not `localhost` to avoid IPv6 resolution issues in Docker.
- **docker_overview widget access** — Bypasses `group_widget_visibility` table. Controlled by `user_groups.docker_widget_access` column. Dashboard route and widget list route both enforce this separately.
- **Topbar widget visibility** — `loadWidgets()` in `Topbar.tsx` depends on `[isAuthenticated, authUser?.id]` so the permission-filtered widget list is always refreshed after login/logout. Without this, a user's stale widget list would persist in the Zustand store across auth state changes, potentially showing topbar widgets that the new user's group cannot access.
- **AdGuard password** — Stripped by `sanitize()` in widgets.ts before any response. Never leaves the backend.

---

## Coding Guidelines

### General
- TypeScript strict mode everywhere — no `as any`, no `Body: any`. Use proper interfaces.
- Keep components small and focused. No god components.
- CSS in `global.css` only — no inline styles except for dynamic values.
- Use `lucide-react` for all icons. Sizes: 16px topbar/sidebar, 14px group headers, 12px card buttons.
- No new dependencies without a clear reason. The stack is intentionally minimal.

### Frontend
- All API calls go through `api.ts` — never call `fetch` directly in components.
- All state mutations go through the Zustand store — never call `api.*` directly in components.
- `useStore` = main app; `useArrStore` = media; `useDockerStore` = Docker; `useWidgetStore` = widgets; `useDashboardStore` = dashboard items.
- Status "unknown" = neutral gray dot only — no text, no tooltip.
- Error messages go in local `error` state → displayed inline in the form/modal.

### Backend
- Define a TypeScript interface for every request body (`CreateXBody`, `PatchXBody`) and every DB row (`ServiceRow`, `WidgetRow`, etc.).
- Return `RowType | undefined` from `.get()` — never `unknown` or `any`.
- Use `reply.status(N).send({ error: '...' })` for all error responses (before hijack).
- HTTP status codes: 400 bad input, 404 not found, 413 too large, 415 unsupported type.
- Never expose `api_key`, `password_hash`, or widget passwords in API responses.

### CSS / Theming
- All colors via CSS variables (`var(--text-primary)`, `var(--accent)`, etc.).
- Theme switching: change `data-theme` + `data-accent` on `document.documentElement`.
- `color-scheme: dark/light` set per theme block so native controls render correctly.
- Glass card: `.glass` class + `backdrop-filter: blur(20px) saturate(180%)`.
- Border radius: `--radius-sm` (8px) → `--radius-md` (14px) → `--radius-lg` (20px) → `--radius-xl` (28px).
- `btn-primary`: outline style — transparent background, accent color border and text.

---

## Deployment Workflow

1. Make changes, commit, push to `main`
2. GitHub → Actions → "Build & Push Docker Image" → Run workflow → enter tag
3. SSH into Unraid: `cd /path/to/heldash && docker compose pull && docker compose up -d`

**Image**: `ghcr.io/kreuzbube88/heldash:<tag>`
**Data volume**: `/mnt/cache/appdata/heldash:/data` (contains `db/heldash.db` and `icons/`)

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| PORT | 8282 | Fastify listen port |
| DATA_DIR | /data | Root for DB and icon files |
| NODE_ENV | production | |
| LOG_LEVEL | info | Pino log level |
| SECRET_KEY | — | **Required.** JWT signing secret (`openssl rand -hex 32`) |
| SECURE_COOKIES | false | `true` = HTTPS only (behind TLS proxy) |

---

## Roadmap

### Phase 1 — Core ✓
- [x] Service tiles with status indicators, health checks, icon upload
- [x] Service groups with drag-and-drop reordering
- [x] Dark/light mode + 3 accent colors
- [x] Dashboard title customization
- [x] Glass morphism design system

### Phase 2 — Auth & Multi-user ✓
- [x] Local username/password auth (bcrypt + JWT httpOnly cookie)
- [x] First-launch setup page
- [x] Group-based access control (grp_admin / grp_guest / custom)
- [x] Per-group app, media, and widget visibility
- [x] Per-group Docker page and Docker widget access
- [x] User management (CRUD, password reset, group assignment)
- [x] Guest theme customization via localStorage
- [ ] OIDC integration (voidauth / Authentik) — user model is OIDC-ready

### Phase 3 — Media & Dashboard ✓
- [x] Radarr / Sonarr / Prowlarr / SABnzbd integrations
- [x] Server-side proxy (API keys never reach browser)
- [x] Modular dashboard (free arrangement, DnD, placeholder cards)
- [x] Per-user dashboards with admin-managed guest dashboard
- [x] Widget system: Server Status, AdGuard Home, Docker Overview
- [x] Topbar widget stats

### Phase 4 — Docker ✓
- [x] Docker page: live container list, sortable table, overview stats bar
- [x] Batch CPU/RAM stats (parallel Pool connections)
- [x] Live log streaming via SSE (stdout + stderr, filter, reconnect)
- [x] Start / Stop / Restart containers (admin-only)
- [x] Docker Overview widget with container counts and control dropdown

### Phase 5 — Enhancements
- [ ] OIDC / SSO via voidauth or Authentik
- [ ] Notification webhooks (Gotify / ntfy) on status change
- [ ] Custom check intervals per service (backend scheduler)
- [ ] Import/export service list (JSON)
- [ ] More integrations (Immich, Jellyfin, ...)
