# CLAUDE.md — HELDASH

Personal homelab dashboard: service tiles, DnD layout, Media (Radarr/Sonarr/Prowlarr/SABnzbd), Docker management, Widgets, Home Assistant, TRaSH Guides sync. Self-hosted on Unraid behind nginx-proxy-manager.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript (strict), Vite 5 |
| State | Zustand (useStore + useArrStore + useDockerStore + useWidgetStore + useDashboardStore + useHaStore + useRecyclarrStore) |
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

## Architecture

- Single container: Fastify serves `/api/*` + React SPA. No nginx inside container.
- SQLite: WAL, no ORM, row types as interfaces, booleans as 0/1, `let db!: Database.Database`.
- Auth: JWT httpOnly cookie. `app.authenticate` = verify JWT; `app.requireAdmin` = verify + `groupId === 'grp_admin'`. Public: all GETs, `/api/auth/status`, check endpoints.
- ACL: `grp_admin` full+undeletable; `grp_guest` read-only no Docker; custom groups sparse visibility (row = hidden). `docker_overview` gated by `docker_widget_access`, not visibility table.
- Stores: `useStore`=main; `useArrStore`=media; `useDockerStore`=Docker; `useWidgetStore`=widgets; `useDashboardStore`=dashboard; `useHaStore`=HA; `useTrashStore`=TRaSH.
- Frontend routing: no React Router, single `page` string in `App.tsx`.
- Dashboard: 20-column CSS grid; apps=2 cols, widgets=4×2 cols; `grid-auto-flow:dense`.
- DnD: position/position_x columns patched on drag end; optimistic update then async persist.
- Docker proxy: `undici.Pool` (10 conn) to `/var/run/docker.sock`; SSE: `reply.hijack()` before Docker request.
- Widgets: credentials stripped by `sanitize()`; `docker_overview` bypasses `group_widget_visibility`.
- Icon/background upload: base64 JSON, `path.basename()` prevents traversal.
- Media proxy: `api_key` stripped by `sanitize()`; `rejectUnauthorized:false` for self-signed certs.
- SABnzbd: `/api?mode=X&apikey=KEY&output=json`; `SabnzbdClient` does NOT extend `ArrBaseClient`.
- HA WS bridge: `HaWsClient` per instanceId in `HaWsManager`; SSE fans events; backoff 5s→60s; invalidated on PATCH/DELETE.
- Recyclarr: generates recyclarr.yml (v8 syntax) from DB; writes user CF JSON files to {RECYCLARR_CONFIG_DIR}/user-cfs/{service}/; manages settings.yml resource_providers; syncs via docker exec (SSE stream hidden from user, shown on request via sync history); score change detection vs last_known_scores; CF groups fetched via `recyclarr list custom-format-groups` (cached 5min); sync history stored (max 10); config backup before every sync (max 5 .bak files).
- CF Manager: user-created CFs only; creates/updates/deletes in Arr AND JSON files; schema from GET /api/v3/customformat/schema (memory-cached 1h per instance); trash_id = "user-{slug}", generated once on create, never changes.
- HA Areas: panels grouped by area_id; areas via WS config/area_registry/list; entity area auto-detected via config/entity_registry/get.
- Activity Log: `activity_log` table (max 100 rows); logs HA state changes (light/switch/climate/cover/media_player/automation — rate-limited 1/entity/60s, never sensor/*), Docker container state transitions, service health transitions, Recyclarr sync results. Never logs api_key/token/password. Authenticated users only.
- Service Health History: `service_health_history` table; persists every health check result; auto-cleanup > 7 days; aggregated by hour for uptime graph display. Server-side scheduler writes `last_status` every 2 min; frontend reads every 30s.
- Onboarding: one-time wizard on first admin login; skippable; re-openable from Settings.
- `sanitize()` strips `api_key`, `password_hash`, `token`, widget passwords — never expose in API responses.

## Coding Rules

### General
- TypeScript strict everywhere — no `as any`, no `Body: any`. Proper interfaces for every request body and DB row.
- Keep components small. No god components. No new dependencies without clear reason.
- CSS in `global.css` only — no inline styles except dynamic values.
- Icons: `lucide-react`. Sizes: 16px topbar/sidebar, 14px group headers, 12px card buttons.

### Frontend
- All API calls via `api.ts` — never call `fetch` directly in components.
- All state mutations via Zustand store — never call `api.*` directly in components.
- Shared pure functions in `utils.ts` — never redefine `normalizeUrl` or `containerCounts` inline.
- `useEffect` deps: stable primitives only — never `.filter()/.map()` directly in dep array.
- Parallelize independent API calls with `Promise.all()`.
- Status "unknown" = neutral gray dot only — no text, no tooltip.
- Errors in local `error` state → displayed inline in form/modal.

### Backend
- Interface for every request body (`CreateXBody`, `PatchXBody`) and DB row (`ServiceRow`, `WidgetRow`).
- Return `RowType | undefined` from `.get()` — never `unknown` or `any`.
- `reply.status(N).send({ error: '...' })` for all errors (before hijack).
- HTTP codes: 400 bad input, 404 not found, 413 too large, 415 unsupported type.
- Recyclarr YAML: v8 only — no include blocks; quality_profiles/assign_scores_to by trash_id; omit fields equal to defaults.
- User CF trash_id: "user-{slug}" — frozen on create, never changed on rename.
- settings.yml paths: always /config/... (Recyclarr container perspective).

## CSS System

All colors via CSS variables. Theme switch: `data-theme` + `data-accent` on `<html>`. `color-scheme: dark/light` per theme block.

**Spacing (8px base)**:
```
--spacing-xs: 4px    --spacing-md: 12px    --spacing-2xl: 24px
--spacing-sm: 8px    --spacing-lg: 16px    --spacing-3xl: 32px
                     --spacing-xl: 20px
```

**Typography**: `--font-sans: 'Geist'` | `--font-display: 'Space Mono'` (h1–h4) | `--font-mono: 'JetBrains Mono'`

**Transitions**:
```
--transition-fast: 100ms cubic-bezier(0.4, 0, 0.2, 1)
--transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1)
--transition-smooth: 350ms cubic-bezier(0.34, 1.56, 0.64, 1)  ← bounce
--transition-slow: 500ms ease
```

**Glass**: `.glass` + `backdrop-filter: blur(24px) saturate(200%)`

**Radius**: `--radius-sm` 8px → `--radius-md` 12px → `--radius-lg` 16px → `--radius-xl` 24px → `--radius-2xl` 32px

**Components**: cards lift 4px + icon 1.08x on hover; status dots pulse (online) / breathe (offline); `@media (prefers-reduced-motion)` disables all animations.

## Gotchas

- **better-sqlite3**: rejects JS booleans — always `value ? 1 : 0`.
- **Docker Pool**: `new Pool('http://localhost', { socketPath: '/var/run/docker.sock', connections: 10 })` — do NOT use `undici.Client` (serialized requests).
- **SSE hijack**: `reply.hijack()` before Docker request; errors must be sent as SSE events after.
- **Docker log mux**: non-TTY frames have 8-byte header `[type(1)][reserved(3)][size(4)]`; first byte `0x01/0x02` = muxed.
- **Self-signed TLS**: all undici agents use `connect: { rejectUnauthorized: false }`.
- **DB migration**: `ALTER TABLE … ADD COLUMN` in try/catch in `runMigrations()` — silently ignores "column exists". Returns count of applied migrations.
- **Icon paths**: `path.basename()` in `/icons/:filename` route prevents path traversal.
- **Node.js not on dev machine**: TypeScript errors caught by CI only, cannot run npm/tsc locally.
- **JWT secret**: `SECRET_KEY` env required; insecure default in dev logged as warning.
- **Sonarr calendar**: requires `includeSeries=true`; use `series?.title` (null safety).
- **Healthcheck**: use `127.0.0.1` not `localhost` (avoids IPv6 resolution issues).
- **Service visibility SQL**: LEFT JOIN + `WHERE g.service_id IS NULL` — never load all rows and filter in JS.
- **docker_overview access**: controlled by `docker_widget_access` column, enforced in both dashboard and widget list routes.
- **Topbar widget visibility**: `loadWidgets()` depends on `[isAuthenticated, authUser?.id]` — stale list otherwise persists across auth changes.
- **Fastify log silencing**: use `{ logLevel: 'silent' }` NOT `{ disableRequestLogging: true }` (not in Fastify 4 types → tsc fail).
- **pino-pretty**: must be in `dependencies` (not devDependencies) — container crashes on startup if absent.
- **@fastify/rate-limit**: use `^8.0.0` with Fastify 4; v9 targets Fastify 5.
- **safeJson helper**: use `{} as any` fallback when accessing config properties; `safeJson<unknown>(str, null)` for settings values.
- **HA token**: `sanitizeInstance()` strips token. PATCH preserves with `token = req.body.token?.trim() || row.token`.
- **HA panels reorder route**: `PATCH /api/ha/panels/reorder` must be registered BEFORE `PATCH /api/ha/panels/:id`.
- **HA panel label**: stored as `null`; resolves `panel.label || friendly_name || entity_id` in frontend — never pre-fill.
- **HA WS**: `auth_invalid` sets `destroyed=true` to stop retry loops; backoff 5s→60s cap.
- **Recyclarr yaml_instance_key**: sanitized on first save (spaces→_, special chars removed), stored in DB, never regenerated.
- **Recyclarr /config vs /recyclarr**: dashboard writes to {RECYCLARR_CONFIG_DIR}/* but settings.yml must use /config/* paths.
- **Recyclarr api_key**: always from arr_instances — never stored in recyclarr_config.
- **User CF trash_id freeze**: "user-{slug}" from original name at create. Never regenerate on rename.
- **CF schema cache**: /api/arr/:id/custom-format-schema cached in memory 1h. Restart clears cache.
- **string | null class field**: cast on assignment (`this.token = data.token as string`) when returning from method typed `Promise<string>`.
- **FST_ERR_CTP_EMPTY_JSON_BODY**: custom content-type parser in server.ts accepts empty bodies; frontend sends `body: JSON.stringify({})`.
- **Activity log rate limit**: max 1 entry per HA entity per 60s — prevents sensor flooding.
- **Recyclarr CF groups cache**: docker exec output cached 5min per instanceId in memory.
- **Sync history**: stored in `recyclarr_sync_history` (max 10 rows) — SSE output not shown during sync, available via "Verlauf anzeigen" after completion.
- **Health history cleanup**: DELETE on insert for entries > 7 days old for that service_id.
- **Docker Events stream**: container state tracking uses `GET /v1.41/events?filters=...` SSE endpoint (not polling); `containerStates` Map populated silently on first list, transitions only logged to activity_log after that.
- **Recyclarr scheduler hot-reload**: saving a schedule calls `restartRecyclarrScheduler()` — no restart needed; new cron takes effect immediately.
- **recyclarr list --raw flag**: all `recyclarr list` commands use `--raw` (no `--config` flag exists). `--raw custom-formats` returns tab-separated `trash_id\tname[\tcategory]`; `--raw custom-format-groups` returns paired lines (group name line + CF line alternating).
- **last_checked column**: column in `services` table is `last_checked` (NOT `last_checked_at`) — always use the correct name in SQL.
- **Service health scheduler**: server writes `last_status` every 2 min server-side; frontend polls `/api/services` every 30s to read it — no client-side ping.
- **CF groups 50% threshold**: profile-cfs route filters group relevance at ≥50% CF overlap; `allGroupCfNamesLower` Set used as fallback to include CFs that appear in any group.
- **User CFs in profile-cfs**: user-created CFs are excluded from `cfs[]` array in the response — frontend receives them separately and merges for display.
- **Logbuch**: single source of truth for all monitoring; activity feed + uptime moved here from Dashboard/ServicesPage. New integrations (Unraid etc.) → add tab to TABS array in LogbuchPage.
- **Health score**: services 40pts + docker 30pts + recyclarr 20pts + ha 10pts; range 0–100.
- **Logbuch calendar**: activity_log grouped by date, last 84 days, GitHub-graph style.
- **Anomaly detection**: category=system, severity=warning, >3 occurrences in 24h → service marked as unstable.
- **Docker Events pendingStops**: delays 'gestoppt' log entry by 5s; 'start' event cancels pending stop (restart sequence); 'restart' event also cancels timer.
- **Service health scheduler**: server-side, every 30s, writes last_status + last_checked; frontend loadServices() every 15s reads from DB. ServiceCard subscribes directly to Zustand store for last_status.
- **Activity timestamps**: SQLite `datetime('now')` stores UTC without 'Z' suffix; backend appends 'Z' to created_at before returning to frontend for correct timezone display.

## Deploy

1. Test builds: "Build & Push Docker Image" workflow → enter version tag (e.g. 0.9.9). Production: "Release Latest" workflow → bumps package.json, creates Git tag, sets latest.
2. Unraid: `docker compose pull && docker compose up -d` from `/path/to/heldash`.
3. Image: `ghcr.io/kreuzbube88/heldash:<tag>` | Data: `/mnt/cache/appdata/heldash:/data`.
