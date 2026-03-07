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
│   ├── vite.config.ts          # Dev proxy /api + /icons + /backgrounds → :8282
│   ├── tsconfig.json           # strict: true, paths: @/* → src/*
│   └── src/
│       ├── main.tsx            # Entry point — just mounts <App />
│       ├── App.tsx             # Root: layout, routing (page state), modals
│       ├── api.ts              # Typed fetch wrapper + all API calls
│       ├── types.ts            # Service, Group, Settings, AuthUser, UserRecord, UserGroup, Widget, Background, DockerContainer, ...
│       ├── store/
│       │   ├── useStore.ts        # Main store: services, groups, settings, auth, users, userGroups, backgrounds
│       │   ├── useArrStore.ts     # Media store: instances, statuses, stats, queues, histories
│       │   ├── useDockerStore.ts  # Docker store: containers, stats, control
│       │   ├── useWidgetStore.ts  # Widget store: widgets, stats, AdGuard toggle
│       │   └── useDashboardStore.ts # Dashboard item store
│       ├── utils.ts               # Shared utilities: normalizeUrl, containerCounts
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
│       │   ├── ServicesPage.tsx # Table view with Dashboard & Health Check toggles (fixed-width columns)
│       │   ├── Settings.tsx    # Tabbed: General (incl. background upload), Users, Groups (Apps/Media/Widgets/Docker/Background tabs), OIDC
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
        ├── clients/
        │   └── nginx-pm-client.ts # NginxPMClient: Nginx Proxy Manager API integration
        └── routes/
            ├── services.ts     # CRUD + /check + /check-all + /icon upload
            ├── groups.ts       # CRUD for service groups
            ├── settings.ts     # Key-value settings store
            ├── auth.ts         # /setup, /login, /logout, /status, /me
            ├── users.ts        # User CRUD + user-group CRUD + visibility endpoints
            ├── arr.ts          # Arr instance CRUD + server-side proxy routes
            ├── widgets.ts      # Widget CRUD + stats endpoints + icon upload
            ├── dashboard.ts    # Dashboard item management (ordered list, per-owner)
            ├── docker.ts       # Docker Engine API proxy (containers, stats, logs SSE, control)
            └── backgrounds.ts  # Background image CRUD + assign to user group
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

### Shared frontend utilities (`utils.ts`)
Two pure functions used across multiple components:
- `normalizeUrl(u)` — strips trailing slash, lowercases. Used in `Dashboard.tsx` and `WidgetsPage.tsx` to match widget URLs against service URLs for icon inheritance.
- `containerCounts(containers)` — single-pass loop returning `{ running, stopped, restarting }`. Used in `DockerPage.tsx`, `WidgetsPage.tsx`, and `Topbar.tsx`. More efficient than three separate `.filter()` calls.

### Service parsing helper (`useStore.ts`)
`parseService(s)` converts the raw `tags` string from the API (`JSON.stringify`'d array) into a proper JS array. Defined once at the top of the store module; used in `loadAll`, `loadServices`, `createService`, and `updateService` to avoid duplicated `JSON.parse(s.tags)` expressions.

### Group-based access control
- `grp_admin` — built-in, full access, always has Docker + Docker widget access (cannot be deleted)
- `grp_guest` — built-in, read-only, no Docker or Docker widget access by default
- Custom groups — read-only with per-group visibility; Docker page and Docker widget access enabled independently by admin
- Visibility is sparse: junction tables store only the **hidden** items (presence = hidden)
- `docker_overview` widgets bypass `group_widget_visibility` — instead filtered by `docker_widget_access` column on `user_groups`
- Background images: each group has a `background_id` FK (nullable) — the background shown on the dashboard for members of that group. Admin assigns via Settings → Groups → Background tab. `GET /api/backgrounds/mine` resolves the caller's group background (unauthenticated falls back to `grp_guest`).

### Docker Engine API proxy
`docker.ts` connects to `/var/run/docker.sock` via `undici.Pool` (10 connections) so batch stats requests run concurrently. Access controlled by `hasDockerAccess()` (checks `docker_access` column on user's group). SSE log streaming uses `reply.hijack()` called **before** the Docker API request so the SSE connection opens immediately; errors are sent as SSE events.

### Widget system
Four widget types: `server_status`, `adguard_home`, `docker_overview`, `nginx_pm`. Widget credentials (AdGuard/Nginx PM passwords) are stripped in `sanitize()` before returning to the frontend — stored server-side only. `docker_overview` widgets have a separate access gate (`docker_widget_access`) and never appear in `group_widget_visibility`. `nginx_pm` uses token-based authentication (username/password → Bearer token cached for 6 hours).

### Dashboard Grid Layout
- **20-column CSS grid** system (changed from responsive minmax to fixed columns)
- **Apps**: span 2 columns = 10 apps max per row
- **Widgets**: span 4 columns, span 2 rows = 2×2 app size
- **grid-auto-flow: dense** for efficient space usage
- Settings: user selects "2 to 10 apps per row" (not pixel widths)

### Multiple Zustand stores
- `useStore` — main app (services, groups, settings, auth, users, userGroups)
- `useArrStore` — media (arr instances, statuses, stats, queues, calendars, indexers, histories)
- `useDockerStore` — Docker (containers list, stats map, control action)
- `useWidgetStore` — widgets (widget list, stats cache, AdGuard toggle)
- `useDashboardStore` — dashboard items (ordered list, add/remove/reorder)

### CSS custom properties, no Tailwind
Full design system via CSS variables (`--glass-bg`, `--accent`, `--text-primary`, etc.). Theme switching works by changing `data-theme` and `data-accent` on `<html>`. No framework overhead.

### Icon / background upload via base64 JSON
No multipart/form-data. Frontend reads the file as DataURL, strips prefix, sends `{ data: string, content_type: string }` as JSON. Backend writes to `DATA_DIR/icons/<id>.<ext>` (icons) or `DATA_DIR/backgrounds/<id>.<ext>` (backgrounds) and stores the path in the DB. Both routes use `path.basename()` to prevent path traversal attacks.

### Drag & Drop persistence strategy
- **Service groups** (app categories): `position` column, PATCH on drag end
- **Services** within app group: `position_x` column, PATCH on drag end
- **Arr media instances**: `position` column, PATCH on drag end
- **Dashboard groups** (containers): `position` column in `dashboard_groups`, PATCH `/api/dashboard/groups/reorder`
- **Dashboard items** (ungrouped): `position` column in `dashboard_items`, PATCH `/api/dashboard/reorder`
- **Dashboard items** within groups: `position` column in `dashboard_items`, PATCH `/api/dashboard/groups/:id/reorder-items`
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
| background_id | TEXT | FK → backgrounds.id (nullable) — dashboard background for this group |
| created_at | TEXT | |

### backgrounds
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| name | TEXT NOT NULL | Display name |
| file_path | TEXT NOT NULL | `/backgrounds/<id>.<ext>` |
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
| type | TEXT | 'server_status' \| 'adguard_home' \| 'docker_overview' \| 'nginx_pm' |
| name | TEXT NOT NULL | |
| config | TEXT | JSON — AdGuard/Nginx PM password stripped before sending to frontend |
| position | INTEGER | |
| show_in_topbar | INTEGER | 0/1 |
| display_location | TEXT | 'topbar' \| 'sidebar' \| 'none' |
| icon_url | TEXT | Custom icon (docker_overview falls back to Container lucide icon) |
| created_at / updated_at | TEXT | |

### dashboard_items
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| type | TEXT | 'service' \| 'arr_instance' \| 'widget' \| 'placeholder*' |
| ref_id | TEXT | NULL for placeholders |
| position | INTEGER | Sort order within owner/group |
| group_id | TEXT | FK → dashboard_groups.id (nullable) — NULL = ungrouped |
| owner_id | TEXT | user sub or 'guest' |
| created_at | TEXT | |

### dashboard_groups
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| name | TEXT NOT NULL | Group display name |
| owner_id | TEXT NOT NULL | user sub or 'guest' |
| position | INTEGER NOT NULL | Sort order among groups |
| col_span | INTEGER NOT NULL | Width on 20-column grid (1-20, default 10). Each app = 2 cols, widget = 4 cols |
| created_at | TEXT NOT NULL | |

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
| GET | /api/services/export | requireAdmin | Export all services as JSON |
| POST | /api/services/import | requireAdmin | Import services from JSON |

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
| PUT | /api/user-groups/:id/background | requireAdmin | Assign background (background_id or null) |

### Widgets
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/widgets | public (filtered) | List widgets visible to caller |
| POST | /api/widgets | requireAdmin | Create widget |
| PATCH | /api/widgets/:id | requireAdmin | Update widget |
| DELETE | /api/widgets/:id | requireAdmin | Delete + icon file |
| GET | /api/widgets/:id/stats | public | Live stats (server_status / adguard_home / nginx_pm with proxy+cert counts; `{}` for docker_overview) |
| POST | /api/widgets/:id/icon | requireAdmin | Upload custom icon |
| POST | /api/widgets/:id/adguard/protection | requireAdmin | Toggle AdGuard protection |

### Dashboard
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/dashboard | public | Ordered groups + items with embedded data, filtered by owner + group visibility |
| **Group Management** |
| POST | /api/dashboard/groups | authenticate | Create group |
| PATCH | /api/dashboard/groups/reorder | authenticate | Reorder groups |
| PATCH | /api/dashboard/groups/:id | authenticate | Update group (name, col_span) |
| DELETE | /api/dashboard/groups/:id | authenticate | Delete group (items become ungrouped) |
| PATCH | /api/dashboard/items/:id/group | authenticate | Move item to group (or NULL to ungroup) |
| PATCH | /api/dashboard/groups/:id/reorder-items | authenticate | Reorder items within group |
| **Item Management** |
| POST | /api/dashboard/items | authenticate | Add item |
| DELETE | /api/dashboard/items/:id | authenticate | Remove item |
| DELETE | /api/dashboard/items/by-ref | authenticate | Remove by type + ref_id |
| PATCH | /api/dashboard/reorder | authenticate | Reorder ungrouped items |

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

### Backgrounds
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/backgrounds | requireAdmin | List all background images |
| GET | /api/backgrounds/mine | public | Background assigned to caller's group (null if none) |
| POST | /api/backgrounds | requireAdmin | Upload background (base64 JSON, max 5 MB, png/jpg/svg/webp) |
| DELETE | /api/backgrounds/:id | requireAdmin | Delete background + file, clears all group assignments |

### Misc
| Method | Path | Description |
|---|---|---|
| GET | /api/health | `{ status, version, uptime }` |
| GET | /api/time | `{ iso }` — server time |
| GET | /icons/:filename | Serve uploaded icons |
| GET | /backgrounds/:filename | Serve uploaded background images |

---

## Known Constraints & Gotchas

- **better-sqlite3 rejects JS booleans** — Always convert: `check_enabled ? 1 : 0`
- **undici Pool for Docker** — `new Pool('http://localhost', { socketPath: '/var/run/docker.sock', connections: 10 })`. Pool allows concurrent batch stats requests. Do NOT use `undici.Client` (single connection = serialized requests = N × 1s delay for stats).
- **SSE log stream** — `reply.hijack()` must be called **before** the Docker API request so the SSE connection opens immediately. After hijack, errors must be sent as SSE events (cannot use `reply.status()` anymore).
- **Docker log multiplexing** — Non-TTY containers prefix each frame with an 8-byte header: `[stream_type(1)][reserved(3)][size(4 big-endian)]`. TTY containers send raw text. Detection: first byte is `0x01` or `0x02` = muxed.
- **Self-signed TLS** — undici agents use `connect: { rejectUnauthorized: false }` — homelabs use self-signed certs.
- **let db!: Database.Database** — Definite assignment assertion required for module-level DB instance with TypeScript strict mode.
- **DB migrations** — `ALTER TABLE … ADD COLUMN` inside try/catch in `runMigrations()` — silently ignores "column already exists" on old DB files. `runMigrations()` returns the count of newly applied migrations (0 = already up-to-date); `initDb()` returns this count so `server.ts` can log it on startup.
- **Icon paths** — `path.basename()` in the `/icons/:filename` route prevents path traversal attacks.
- **Node.js not installed on dev machine** — Cannot run npm/tsc locally; TypeScript errors caught by CI only.
- **JWT secret** — `SECRET_KEY` env var required. Falls back to insecure default in dev (logged as warning).
- **Sonarr calendar** — Requires `includeSeries=true`, otherwise `series` is undefined on episode objects.
- **SABnzbd API** — Single `/api` endpoint, `mode=X&apikey=KEY&output=json`. `SabnzbdClient` does NOT extend `ArrBaseClient`.
- **Healthcheck** — Uses `127.0.0.1` not `localhost` to avoid IPv6 resolution issues in Docker.
- **Service visibility SQL pattern** — `GET /api/services` uses a `LEFT JOIN group_service_visibility` to filter hidden services directly in SQL (`WHERE g.service_id IS NULL`). Never load all rows into memory and filter in JS.
- **docker_overview widget access** — Bypasses `group_widget_visibility` table. Controlled by `user_groups.docker_widget_access` column. Dashboard route and widget list route both enforce this separately.
- **Topbar widget visibility** — `loadWidgets()` in `Topbar.tsx` depends on `[isAuthenticated, authUser?.id]` so the permission-filtered widget list is always refreshed after login/logout. Without this, a user's stale widget list would persist in the Zustand store across auth state changes, potentially showing topbar widgets that the new user's group cannot access.
- **AdGuard password** — Stripped by `sanitize()` in widgets.ts before any response. Never leaves the backend.
- **Logging** — pino-pretty is always active (not just in `NODE_ENV=development`). `LOG_FORMAT=json` disables it for raw JSON output. `/api/health` and `/api/time` use `logLevel: 'silent'` (polled every 30s each — would flood logs otherwise). Auth failures, service status changes, and Docker control actions all emit structured log entries with context fields (`username`, `id`, `name`, etc.). Sensitive headers (`authorization`, `cookie`) are redacted via Pino `redact` option. Graceful shutdown handled via `process.on('SIGTERM'/'SIGINT')` with `await app.close()` before `process.exit(0)`.
- **Fastify route log silencing** — Use `{ logLevel: 'silent' }` as route option, NOT `{ disableRequestLogging: true }`. `disableRequestLogging` is not present in Fastify 4's `RouteShorthandOptions` TypeScript types — causes `tsc` build failure with `strict: true`.
- **pino-pretty is a runtime dependency** — Must be listed in `backend/package.json` `dependencies`. It is referenced only as a string transport target (`target: 'pino-pretty'`) so `tsc` won't catch the missing package — but the container crashes on startup with "Cannot find package 'pino-pretty'" if it's absent.

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
- Shared pure functions go in `utils.ts` — never redefine `normalizeUrl` or container counting inline.
- `useEffect` dependency arrays must use stable primitives (strings, numbers) — never put `.filter()` or `.map()` calls directly inside the array; extract to a variable first.
- Parallelize independent API calls with `Promise.all()` — never fire them sequentially with separate `.catch()` chains.
- Status "unknown" = neutral gray dot only — no text, no tooltip.
- Error messages go in local `error` state → displayed inline in the form/modal.

### Backend
- Define a TypeScript interface for every request body (`CreateXBody`, `PatchXBody`) and every DB row (`ServiceRow`, `WidgetRow`, etc.).
- Return `RowType | undefined` from `.get()` — never `unknown` or `any`.
- Use `reply.status(N).send({ error: '...' })` for all error responses (before hijack).
- HTTP status codes: 400 bad input, 404 not found, 413 too large, 415 unsupported type.
- Never expose `api_key`, `password_hash`, or widget passwords in API responses.

### CSS / Theming & Design System
- All colors via CSS variables (`var(--text-primary)`, `var(--accent)`, etc.).
- Theme switching: change `data-theme` + `data-accent` on `document.documentElement`.
- `color-scheme: dark/light` set per theme block so native controls render correctly.

**Spacing Grid (8px base)**:
```
--spacing-xs: 4px    --spacing-md: 12px    --spacing-2xl: 24px
--spacing-sm: 8px    --spacing-lg: 16px    --spacing-3xl: 32px
                     --spacing-xl: 20px
```

**Typography**:
- `--font-sans: 'Geist'` — refined, modern body text
- `--font-display: 'Space Mono'` — distinctive display headers (h1-h4)
- `--font-mono: 'JetBrains Mono'` — monospace for codes/timestamps

**Transitions (cubic-bezier easing)**:
```
--transition-fast: 100ms cubic-bezier(0.4, 0, 0.2, 1)
--transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1)
--transition-smooth: 350ms cubic-bezier(0.34, 1.56, 0.64, 1)  ← bounce
--transition-slow: 500ms ease
```

**Glass cards**: `.glass` class + `backdrop-filter: blur(24px) saturate(200%)`

**Border radius**: `--radius-sm` (8px) → `--radius-md` (12px) → `--radius-lg` (16px) → `--radius-xl` (24px) → `--radius-2xl` (32px)

**Component highlights**:
- Service cards: smooth lift on hover (4px translate), icon scale (1.08x), glow shadow
- Sidebar nav: active state with gradient overlay + glow effect, 2px translate on hover
- Status dots: online = dual-pulse (ring + border), offline = breathing animation
- Form inputs: focus ring with accent color, subtle hover state
- Toggles: smooth animation (350ms), better visual feedback
- Dark mode: accent-subtle optimized per color (12% opacity), icon backgrounds enhanced (15% opacity)
- **Accessibility**: Full `@media (prefers-reduced-motion: reduce)` support — all animations disabled

---

## Deployment Workflow

1. Make changes, commit, push to `main`
2. GitHub → Actions → "Build & Push Docker Image" → Run workflow → enter tag
3. SSH into Unraid: `cd /path/to/heldash && docker compose pull && docker compose up -d`

**Image**: `ghcr.io/kreuzbube88/heldash:<tag>`
**Data volume**: `/mnt/cache/appdata/heldash:/data` (contains `db/heldash.db`, `icons/`, and `backgrounds/`)

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| PORT | 8282 | Fastify listen port |
| DATA_DIR | /data | Root for DB and icon files |
| NODE_ENV | production | |
| LOG_LEVEL | info | Pino log level |
| LOG_FORMAT | pretty | `pretty` = pino-pretty always on (colorized, human-readable). `json` = raw structured JSON for log aggregators |
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

### Phase 5 — Enhancements ✓
- [x] Background images — upload and assign per user group (applied as subtle overlay)
- [x] **UI/UX Refinement** — distinctive typography, refined glass morphism, strategic micro-interactions
  - [x] Geist + Space Mono typography system (modern body + distinctive display)
  - [x] Consistent 8px spacing grid across all components
  - [x] Refined glass morphism (24px blur, 200% saturate)

**Component-Level Improvements**:
  - [x] **Sidebar**: Gradient overlay on hover, active state with glow (box-shadow), 2px translate
  - [x] **Topbar**: Time display in monospace, widget stats with compact layout, elevated height (64px)
  - [x] **Dashboard**: 20-column grid layout (10 apps max per row), dashboard groups with col-span selector, group headers with uppercase labels
  - [x] **Dashboard Groups**: Expandable group containers with individual col-span, drag-reorder, nested item DnD
  - [x] **Service Cards**: Hover lift (4px), icon scale (1.08x), glow shadow, status dots with dual animations
  - [x] **Media Cards**: Queue progress bars, stats display with accent colors, expandable sections
  - [x] **Services Page**: Hover row effects, inline status dots, **Dashboard toggle + Health Check toggle**, modal with form inputs
  - [x] **Media Page**: Instance cards, queue lists, calendar views with smooth transitions
  - [x] **Docker Page**: Sortable table, status badges, logs viewer with monospace font, stats bar with large numbers
  - [x] **Widgets Page**: Grid layout, widget cards with shadow on hover, tabbed config panels, stats display
  - [x] **Settings Page**: Tabbed interface (General, Users, Groups with sub-tabs, OIDC), "Apps Per Row" selector (2-10), form inputs with focus states
  - [x] **Status Indicators**: Online (dual-pulse ring + border), offline (breathing animation), unknown (static)
  - [x] **Form Elements**: Focus ring with accent color, hover state, improved toggles (350ms smooth animation)
  - [x] **Modals**: Slide-up animation, glass background, 32px padding, clear title hierarchy
  - [x] **Dark mode**: Per-accent accent-subtle variants (12% opacity), icon backgrounds (15%), nav active states with reduced glow
  - [x] **Accessibility**: Full `@media (prefers-reduced-motion: reduce)` support across all animations

### Phase 6 — Smart Dashboard & Services Controls ✓
- [x] **Nginx Proxy Manager Widget** — token-based auth, proxy/cert monitoring
- [x] **Smart Dashboard Grid** — 20-column layout, 10 apps per row, widgets 2×2 sized
- [x] **Services Page Toggles** — Dashboard toggle (add/remove) + Health Check toggle (enable/disable)
- [x] **Settings Update** — "Apps Per Row" selector (2-10 instead of pixel widths)

### Phase 7 — Future
- [ ] OIDC / SSO via voidauth or Authentik
- [ ] Notification webhooks (Gotify / ntfy) on status change
- [ ] Custom check intervals per service (backend scheduler)
- [ ] Torrent Client Integration (qBittorrent, Transmission, Deluge)
- [ ] More integrations (Immich, Jellyfin, Home Assistant, Pi-hole, etc.)
