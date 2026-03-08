# CLAUDE.md — HELDASH

Personal homelab dashboard. Shows service tiles with live status indicators, groups them into categories, and lets the user drag-and-drop the layout. Includes a Media section for Radarr/Sonarr/Prowlarr/SABnzbd, a Docker page for live container management, a Widget system for at-a-glance system stats, a dedicated Home Assistant page for multi-instance entity monitoring and control, and TRaSH Guides sync for custom format + quality profile management. Designed for self-hosting on Unraid behind nginx-proxy-manager.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript (strict), Vite 5 |
| State | Zustand (useStore + useArrStore + useDockerStore + useWidgetStore + useDashboardStore + useHaStore + useTrashStore) |
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
│       │   ├── useDashboardStore.ts # Dashboard item store
│       │   └── useHaStore.ts      # Home Assistant store: instances, panels, stateMap
│       ├── utils.ts               # Shared utilities: normalizeUrl, containerCounts
│       ├── styles/
│       │   └── global.css      # All CSS: variables, glass, layout, components
│       ├── components/
│       │   ├── Sidebar.tsx     # Left nav (Dashboard / Apps / Media / Docker / Widgets / Home Assistant / TRaSH Guides / Settings / About)
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
│       │   ├── HaPage.tsx      # Home Assistant: multi-instance mgmt, entity browser modal, DnD panel grid
│       │   ├── TrashPage.tsx   # TRaSH Guides: instance panels, configure/preview/import modals, formats/deprecated/log tabs
│       │   └── SetupPage.tsx   # First-launch admin account creation
│       ├── store/
│       │   └── useTrashStore.ts # TRaSH store: configs, profiles, formats, preview, syncLogs, deprecated, importable
│       └── types/
│           ├── arr.ts          # ArrInstance, ArrStats union, SabnzbdStats, queue/history types
│           └── trash.ts        # TrashInstanceConfig, TrashFormatRow, TrashPreview, TrashSyncLogEntry, …
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
        │   ├── nginx-pm-client.ts # NginxPMClient: Nginx Proxy Manager API integration
        │   ├── ha-ws-client.ts    # HaWsClient: single HA WebSocket connection, auth handshake, subscribe_events, auto-reconnect
        │   └── ha-ws-manager.ts   # Singleton pool of HaWsClient keyed by instanceId; invalidate on PATCH/DELETE
        ├── trash/
        │   ├── types.ts           # All shared TRaSH types (NormalizedCustomFormat, ArrSnapshot, Changeset, SyncReport, …)
        │   ├── github-fetcher.ts  # Incremental GitHub fetch: commit SHA + per-file SHA comparison
        │   ├── trash-parser.ts    # Two-pass JSON parser: CFs → slug map → quality profiles; conditions hash
        │   ├── format-id-resolver.ts # In-memory slug→ArrId mapping with DB persistence; O(1) lookup
        │   ├── arr-rate-limiter.ts   # Token bucket (5 req/s per instance); per-instance singleton pool
        │   ├── client-interface.ts   # TrashArrClient interface (CF + profile CRUD)
        │   ├── merge-engine.ts    # Pure changeset computation (no external calls); phases A-E
        │   ├── sync-executor.ts   # Executes changeset phases A-E with checkpoint safety + audit log
        │   ├── repair-engine.ts   # Drift detection: missing_in_arr, conditions_drift, deprecated_still_enabled
        │   ├── migration-runner.ts # Re-normalizes cache rows where schema_version < PARSER_SCHEMA_VERSION
        │   └── scheduler.ts       # Per-instance timers with 2s stagger; acquireSync/releaseSync guard
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
            ├── backgrounds.ts  # Background image CRUD + assign to user group
            ├── ha.ts           # Home Assistant: instance CRUD + HA proxy (states, service calls) + panel CRUD + SSE stream
            └── trash.ts        # TRaSH Guides: configure, sync, preview, apply, overrides, log, deprecated, import
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
Five widget types: `server_status`, `adguard_home`, `docker_overview`, `nginx_pm`, `home_assistant`. Widget credentials (AdGuard/Nginx PM passwords) are stripped in `sanitize()` before returning to the frontend — stored server-side only. `docker_overview` widgets have a separate access gate (`docker_widget_access`) and never appear in `group_widget_visibility`. `nginx_pm` uses token-based authentication (username/password → Bearer token cached for 6 hours). `home_assistant` widget polls entity states via `GET /api/ha/instances/:id/states`.

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
- `useHaStore` — Home Assistant (instances, panels, stateMap per instance)
- `useTrashStore` — TRaSH Guides (configs, profiles, formats, preview, syncLogs, deprecated, importable; all keyed by instanceId)

### TRaSH Guides sync architecture
- **GitHub fetch**: incremental — commit SHA check → git tree diff → per-file SHA comparison → fetch only changed files. Files sorted alphabetically before parsing (deterministic slug assignment).
- **Parser**: two-pass — CFs first (build `trash_id→slug` map) → quality profiles (resolve trash_id refs). `PARSER_SCHEMA_VERSION` constant triggers re-normalization on schema bump.
- **Slug**: `kebab_case(name)` with `+→-plus`, `&→-and`, `__dup1`/`__dup2` collision namespace.
- **Conditions hash**: `SHA-256(sorted JSON)`, first 16 hex chars — stored in cache and `trash_format_instances` for O(1) drift detection.
- **Format ID resolver**: `trash_format_instances` table + in-memory `Map<instanceId, Map<slug, TrashFormatInstance>>`. Resolves `arr_format_id` by slug; invalidated after sync.
- **Merge engine** (`merge-engine.ts`): pure function — no external API calls. Takes `ArrSnapshot` (pre-loaded live arr state) + upstream formats + overrides + deprecated slugs → returns `Changeset`.
- **Rate limiter**: token bucket 5 req/s per instance; singleton pool `getRateLimiter(instanceId)`.
- **Sync phases**: A=Create, B=UpdateConditions, C=ProfileScorePatch, D=SoftDeprecate, E=Repair. Each wrapped in try/catch (no abort on single failure).
- **Notify mode**: changeset stored as `trash_pending_previews` row (expires 24h). User reviews via `GET /preview` → applies via `POST /apply/:pid`.
- **Scheduler**: on startup, compares `now - last_sync_at` vs `sync_interval_hours`; staggered 2s between instances. `registerSyncFn()` called inside route plugin to pass `app.log` to scheduler.
- **Repair**: daily drift scan via `repair-engine.ts`; detects `missing_in_arr`, `conditions_drift`, `deprecated_still_enabled`. Interrupted checkpoints (from crashed syncs) logged on startup.

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

### ha_instances
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| name | TEXT NOT NULL | Display name |
| url | TEXT NOT NULL | HA base URL (trailing slash stripped) |
| token | TEXT NOT NULL | Long-Lived Access Token — **never returned to frontend** |
| enabled | INTEGER | 0/1 |
| position | INTEGER | Sort order |
| created_at / updated_at | TEXT | |

### ha_panels
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | nanoid() |
| instance_id | TEXT NOT NULL | FK → ha_instances.id (cascaded on delete) |
| entity_id | TEXT NOT NULL | HA entity_id (e.g. `light.living_room`) |
| label | TEXT | Custom display label (null → falls back to friendly_name → entity_id) |
| panel_type | TEXT | `'auto'` (default) or explicit type hint |
| position | INTEGER | Sort order within owner's panel grid |
| owner_id | TEXT | user sub — panels are per-user |
| created_at | TEXT | |

### settings
Key-value table. Values stored as JSON strings. Keys: `theme_mode`, `theme_accent`, `dashboard_title`, `auth_enabled`, `auth_mode`.

### TRaSH Guides tables (summary)
| Table | Purpose |
|---|---|
| `trash_guides_cache` | Normalized CF + profile data from GitHub; keyed by `(arr_type, category, slug)` |
| `trash_guides_file_index` | Per-file SHA for incremental fetching |
| `trash_format_instances` | `slug ↔ arr_format_id` mapping per instance; stores `last_conditions_hash` |
| `trash_instance_configs` | Per-instance sync config (profile_slug, sync_mode, interval, enabled) |
| `trash_user_overrides` | Per-instance per-slug score + enabled overrides |
| `trash_custom_formats` | User-imported or non-TRaSH formats tracked by HELDASH |
| `trash_deprecated_formats` | Formats removed from TRaSH; score=0, kept in arr until user deletes |
| `trash_pending_previews` | Stored changesets for notify-mode review; expires 24h |
| `trash_sync_checkpoints` | Crash-safe in-progress sync state (UNIQUE on instance_id) |
| `trash_sync_log` | Audit log: one row per sync run with status, counts, duration |

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

### Home Assistant
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/ha/instances | optional | List instances (token stripped; non-admin sees enabled only; unauth gets `[]`) |
| POST | /api/ha/instances | requireAdmin | Create instance |
| PATCH | /api/ha/instances/:id | requireAdmin | Update (empty token = keep existing) |
| DELETE | /api/ha/instances/:id | requireAdmin | Delete + cascade all panels |
| POST | /api/ha/instances/:id/test | requireAdmin | Test HA connection (`{ ok, error? }`) |
| GET | /api/ha/instances/:id/states | authenticate | Proxy `GET /api/states` from HA (all entities) |
| GET | /api/ha/instances/:id/stream | authenticate | SSE stream of `state_changed` events from HA WebSocket bridge |
| POST | /api/ha/instances/:id/call | authenticate | Proxy `POST /api/services/:domain/:service` to HA |
| GET | /api/ha/panels | optional | List caller's panels (owner_id = sub or 'guest') |
| POST | /api/ha/panels | authenticate | Add panel (409 if duplicate) |
| PATCH | /api/ha/panels/reorder | authenticate | Reorder panels (registered before `:id` route) |
| PATCH | /api/ha/panels/:id | authenticate | Update panel label / panel_type |
| DELETE | /api/ha/panels/:id | authenticate | Remove panel |

### TRaSH Guides
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/trash/instances | authenticate | List configured instances with `isSyncing` flag |
| POST | /api/trash/instances/:id/configure | requireAdmin | Upsert sync config (profile_slug, sync_mode, interval, enabled) |
| GET | /api/trash/instances/:id/profiles | authenticate | Available TRaSH quality profiles from cache |
| GET | /api/trash/instances/:id/custom-formats | authenticate | All formats with user overrides merged in |
| GET | /api/trash/instances/:id/overrides | authenticate | Raw user overrides |
| PUT | /api/trash/instances/:id/overrides | authenticate | Bulk upsert overrides |
| POST | /api/trash/instances/:id/sync | requireAdmin | Trigger manual sync (async, returns immediately) |
| GET | /api/trash/instances/:id/preview | authenticate | Pending changeset preview (404 if none) |
| POST | /api/trash/instances/:id/apply/:pid | requireAdmin | Apply a pending preview |
| GET | /api/trash/instances/:id/log | authenticate | Sync audit log (default 50 entries) |
| GET | /api/trash/instances/:id/deprecated | authenticate | Deprecated formats list |
| DELETE | /api/trash/instances/:id/deprecated/:slug | requireAdmin | Delete deprecated format (also removes from arr) |
| GET | /api/trash/instances/:id/import-formats | requireAdmin | Live custom formats from arr (for import selection) |
| POST | /api/trash/instances/:id/import-formats | requireAdmin | Import selected format IDs into tracking |
| GET | /api/trash/sync-status | authenticate (silent) | Widget stats — `TrashWidgetStats` |
| POST | /api/trash/github/fetch | requireAdmin | Force re-fetch all TRaSH data from GitHub |

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
- **HA token never in response** — `sanitizeInstance()` in `ha.ts` destructures `token` out before returning. PATCH preserves existing token when the incoming field is empty/blank (`token = req.body.token?.trim() || row.token`).
- **HA panels reorder route ordering** — `PATCH /api/ha/panels/reorder` must be registered BEFORE `PATCH /api/ha/panels/:id`. Fastify static routes take priority over parameterized ones regardless of registration order, but registering first is the safe explicit approach.
- **HA state polling** — `HaPage` polls states every 30s (not 10s like widgets). Polling key is `instanceIds.join(',')` — a stable string from unique instance IDs referenced by current panels. State is stored in `stateMap: Record<instanceId, Record<entity_id, HaEntityFull>>`.
- **HA panel label** — Stored `null` by default (not the HA friendly_name). Frontend resolves: `panel.label || entity?.attributes.friendly_name || panel.entity_id`. Never pre-fill with friendly_name so it stays current if HA renames the entity.
- **HA WebSocket bridge** — `HaWsClient` (undici `WebSocket`) connects to `ws(s)://host/api/websocket`, completes the HA auth handshake, then subscribes to `state_changed` events. The backend SSE endpoint (`GET /api/ha/instances/:id/stream`) fans these events to `EventSource` clients. `HaWsClient` uses `undici.Agent` with `rejectUnauthorized: false` for self-signed certs. Auth failure (`auth_invalid`) sets `destroyed = true` to prevent retry loops. Reconnects with exponential backoff (5s → 60s cap).
- **HA WS client lifecycle** — `HaWsManager` holds one `HaWsClient` per instance ID. Client is created on first SSE subscriber, automatically disconnects when all subscribers close, and is invalidated (destroyed + removed from pool) on instance PATCH or DELETE so updated credentials take effect immediately.
- **Frontend HA subscriptions** — `HaPage` opens one `EventSource` per unique instance ID when panels are loaded. `loadStates` still runs once on mount for the initial bulk snapshot (before WS has connected). `updateEntityState` in `useHaStore` updates a single entity in `stateMap` without touching other instances.
- **TRaSH sync guard** — `acquireSync(instanceId)` returns `false` if already syncing (in-memory `Set<string>`). Routes return 409; scheduler skips. Always `releaseSync` in `.finally()`.
- **TRaSH notify vs apply** — In notify mode the sync function stores a preview and returns early (`return` before `executeSyncChangeset`). Apply-preview route calls `runSync` with trigger `'user_confirm'` which skips the notify branch.
- **TRaSH slug generation** — `toSlug(name)` in `trash-parser.ts`. Must be called consistently everywhere a slug is needed. Never derive slugs from arr format names (different casing/spacing).
- **TRaSH circular import** — `merge-engine.ts` uses `require('./format-id-resolver')` inline to avoid circular dep with `sync-executor → merge-engine → format-id-resolver → (same chain)`. Known code smell but functional.
- **TRaSH rate limiter** — `getRateLimiter(instanceId)` returns singleton per instance. Token bucket: capacity=5, refill=5/s. `execute<T>(fn)` wraps with retry (1s→3s→5s, max 3 attempts).
- **TRaSH `toSlug` export** — `trash-parser.ts` exports `toSlug` for use in `routes/trash.ts` (import-formats route) via `const { toSlug } = await import('../trash/trash-parser')`.
- **TrashPage CSS colors** — Does NOT use `var(--success/warning/error)` (those don't exist in global.css). Uses hardcoded hex: `#10b981` (green), `#f59e0b` (amber), `#f87171` (red).

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

### Completed ✓
- Core: service tiles, groups, DnD, health checks, dark/light + 3 accent themes, glass morphism
- Auth: JWT httpOnly cookie, bcrypt, setup page, grp_admin/grp_guest/custom, per-group visibility (apps/media/widgets/docker)
- Media: Radarr/Sonarr/Prowlarr/SABnzbd, server-side proxy, Seerr requests
- Dashboard: modular DnD grid, dashboard groups with col-span, per-user layouts, guest mode, placeholders
- Widgets: Server Status, AdGuard Home, Docker Overview, Nginx PM, Home Assistant, Pi-hole; topbar/sidebar display
- Docker: live container list, batch stats, SSE log streaming, start/stop/restart, per-group access
- Backgrounds: upload + per-group assignment
- UI: Geist + Space Mono typography, 8px spacing grid, glass morphism, micro-interactions, prefers-reduced-motion
- Home Assistant: multi-instance, entity browser, DnD panel grid, real-time WebSocket bridge, toggle support, HA widget
- TRaSH Guides: custom format + quality profile sync for Radarr/Sonarr; notify/auto/manual modes; preview diff; score overrides; soft deprecation; daily repair; import from arr; audit log; incremental GitHub fetch

### Future
- [ ] OIDC / SSO via voidauth or Authentik (user model already OIDC-ready)
- [ ] Notification webhooks (Gotify / ntfy) on status change
- [ ] Torrent Client Integration (qBittorrent, Transmission, Deluge)
- [ ] More integrations (Immich, Jellyfin, Pi-hole, Unraid array)
