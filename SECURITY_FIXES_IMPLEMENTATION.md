# Security Fixes Implementation Guide

This document provides step-by-step implementation instructions for addressing HELDASH security findings.

---

## Phase 1: Critical Authentication & CSRF Protection (Week 1)

### Fix #1: Add CSRF Protection Middleware

**File**: `backend/src/server.ts`

**Changes**:
```bash
cd backend
npm install @fastify/csrf-protection --save
```

```typescript
// server.ts - add after line 93

import fastifyCsrfProtection from '@fastify/csrf-protection'

// After helmet registration (line 93):
await app.register(fastifyCsrfProtection)

// Then update all state-changing routes:
// POST /api/services, PATCH /api/services/:id, DELETE /api/services/:id
// POST /api/groups, PATCH /api/groups/:id, DELETE /api/groups/:id
// POST /api/users, PATCH /api/users/:id, DELETE /api/users/:id
// ... etc

// Example for services POST:
app.post<{ Body: CreateServiceBody }>(
  '/api/services',
  { preHandler: [app.authenticate, app.csrfProtection] }, // ADD csrfProtection
  async (req, reply) => {
    // ... existing handler
  }
)
```

**Frontend Impact**: Fastify CSRF automatically sets X-CSRF-Token cookie. Axios/fetch needs to send header:

```typescript
// frontend/src/api.ts - update fetch wrapper
async function req<T>(url: string, options?: RequestInit): Promise<T> {
  // Extract CSRF token from cookie
  const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('_csrf='))
    ?.split('=')[1]

  const headers = new Headers(options?.headers || {})
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken)
  }

  return fetch(url, {
    ...options,
    headers,
  }).then(async res => { ... })
}
```

**Testing**:
```bash
# Should work (with CSRF token):
curl -X POST http://localhost:8282/api/services \
  -H "Cookie: _csrf=<token>" \
  -H "X-CSRF-Token: <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","url":"http://test.local"}'

# Should fail (without CSRF token):
curl -X POST http://localhost:8282/api/services \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","url":"http://test.local"}' \
  # → 403 Forbidden
```

---

### Fix #2: Strengthen Cookie SameSite Policy

**File**: `backend/src/routes/auth.ts` (line 35)

**Before**:
```typescript
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 86400,
} as const
```

**After**:
```typescript
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict' as const, // ← CHANGED from 'lax'
  path: '/',
  maxAge: 86400,
} as const
```

**Verification**:
```bash
# After login, check cookie:
curl -c /tmp/cookies.txt http://localhost:8282/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"..."}'

cat /tmp/cookies.txt | grep auth_token
# Should show: ... SameSite=Strict ...
```

---

### Fix #3: Add Rate Limiting to Auth Endpoints

**File**: `backend/src/server.ts` (after CORS registration)

```bash
npm install @fastify/rate-limit --save
```

**Add to server.ts**:
```typescript
import rateLimit from '@fastify/rate-limit'

// After CORS registration (line 98):
await app.register(rateLimit, {
  max: 100, // Global default: 100 requests
  timeWindow: '15 minutes',
  skipOnError: true,
  allowList: [], // No exempt IPs
  redis: process.env.REDIS_URL // Optional: use Redis for distributed rate limiting
})
```

**File**: `backend/src/routes/auth.ts`

```typescript
import rateLimit from '@fastify/rate-limit'

// Login route - stricter limits:
app.post<{ Body: LoginBody }>(
  '/api/auth/login',
  {
    preHandler: [
      async (req, reply) => {
        // Custom rate limiter: 5 attempts per 15 minutes per IP
        const key = `login:${req.ip}`
        const count = store.get(key) || 0
        if (count >= 5) {
          return reply.status(429).send({ error: 'Too many login attempts. Try again in 15 minutes.' })
        }
        store.set(key, count + 1)
        // Cleanup after 15 minutes
        setTimeout(() => store.delete(key), 15 * 60 * 1000)
      }
    ]
  },
  loginHandler
)

// Setup route - even stricter:
app.post<{ Body: SetupBody }>(
  '/api/auth/setup',
  {
    preHandler: [
      async (req, reply) => {
        const key = `setup:${req.ip}`
        const count = store.get(key) || 0
        if (count >= 3) {
          return reply.status(429).send({ error: 'Setup rate limited.' })
        }
        store.set(key, count + 1)
        setTimeout(() => store.delete(key), 60 * 60 * 1000)
      }
    ]
  },
  setupHandler
)

// Simple in-memory store (replace with Redis in production):
const store = new Map<string, number>()
```

**Testing**:
```bash
for i in {1..6}; do
  curl -X POST http://localhost:8282/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"wrong"}'
  echo "Attempt $i"
done
# 6th request should get 429 (Too Many Requests)
```

---

## Phase 2: Input Validation & Data Protection (Week 2)

### Fix #4: Implement Strict Input Validation

**File**: `backend/src/utils/validation.ts` (NEW FILE)

```typescript
import { URL } from 'url'

export interface ValidatedService {
  name: string
  url: string
  description?: string
  tags?: string[]
  group_id?: string | null
  check_enabled?: boolean
  check_url?: string | null
  check_interval?: number
}

export function validateServiceInput(input: unknown): ValidatedService {
  const body = input as Record<string, unknown>

  // Validate name
  const name = body.name as string | undefined
  if (!name?.trim() || name.length < 1 || name.length > 255) {
    throw new Error('name must be 1-255 characters')
  }

  // Validate URL format
  const url = body.url as string | undefined
  if (!url?.trim()) throw new Error('url is required')

  try {
    const parsed = new URL(url)
    const allowed = ['http:', 'https:']
    if (!allowed.includes(parsed.protocol)) {
      throw new Error('URL must use http:// or https://')
    }
    // Block localhost-only in production (optional):
    if (process.env.NODE_ENV === 'production') {
      if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
        throw new Error('Localhost URLs not allowed in production')
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Invalid URL')) {
      throw new Error('Invalid URL format')
    }
    throw err
  }

  // Validate description
  const description = body.description as string | undefined
  if (description && description.length > 500) {
    throw new Error('description max 500 characters')
  }

  // Validate tags
  const tags = body.tags as unknown[]
  if (tags) {
    if (!Array.isArray(tags)) throw new Error('tags must be an array')
    if (tags.length > 50) throw new Error('max 50 tags')
    tags.forEach((tag, i) => {
      if (typeof tag !== 'string') throw new Error(`tags[${i}] must be string`)
      if (tag.length === 0 || tag.length > 50) throw new Error(`tags[${i}] must be 1-50 characters`)
    })
  }

  // Validate check_url if provided
  const check_url = body.check_url as string | undefined | null
  if (check_url && check_url !== null) {
    try {
      new URL(check_url)
    } catch {
      throw new Error('check_url must be valid URL format')
    }
  }

  // Validate check_interval
  const check_interval = body.check_interval as number | undefined
  if (check_interval && (check_interval < 5 || check_interval > 3600)) {
    throw new Error('check_interval must be 5-3600 seconds')
  }

  return {
    name: name.trim(),
    url: url.trim(),
    description: description?.trim(),
    tags,
    group_id: body.group_id as string | null,
    check_enabled: body.check_enabled === true,
    check_url: check_url?.trim() || null,
    check_interval: check_interval || 60,
  }
}
```

**File**: `backend/src/routes/services.ts` (update POST handler)

```typescript
import { validateServiceInput } from '../utils/validation'

app.post<{ Body: CreateServiceBody }>('/api/services', { preHandler: [app.authenticate] }, async (req, reply) => {
  try {
    const validated = validateServiceInput(req.body)

    const id = nanoid()
    db.prepare(`
      INSERT INTO services (id, group_id, name, url, icon, description, tags, check_enabled, check_url, check_interval)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, validated.group_id ?? null, validated.name, validated.url,
      null, validated.description ?? null,
      JSON.stringify(validated.tags ?? []),
      validated.check_enabled ? 1 : 0,
      validated.check_url,
      validated.check_interval
    )

    return reply.status(201).send(db.prepare('SELECT * FROM services WHERE id = ?').get(id))
  } catch (err) {
    app.log.warn({ error: err.message }, 'Service validation failed')
    return reply.status(400).send({ error: err.message })
  }
})
```

**Testing**:
```bash
# Valid:
curl -X POST http://localhost:8282/api/services \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"Test","url":"https://test.local"}'

# Invalid URL scheme:
curl -X POST http://localhost:8282/api/services \
  -d '{"name":"Test","url":"javascript:alert(1)"}'
# → 400 "URL must use http:// or https://"

# Name too long:
curl -X POST http://localhost:8282/api/services \
  -d '{"name":"'$(python3 -c "print('x'*300)")'"}'
# → 400 "name must be 1-255 characters"
```

---

### Fix #5: Apply Group Visibility to GET Endpoints

**File**: `backend/src/routes/services.ts` (update GET :id handler)

**Before**:
```typescript
app.get<{ Params: { id: string } }>('/api/services/:id', async (req, reply) => {
  const row = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id)
  if (!row) return reply.status(404).send({ error: 'Not found' })
  return row
})
```

**After**:
```typescript
app.get<{ Params: { id: string } }>('/api/services/:id', async (req, reply) => {
  let groupId = 'grp_guest'
  try {
    await req.jwtVerify()
    groupId = req.user.groupId ?? 'grp_guest'
  } catch { /* guest access */ }

  // Admin sees everything
  if (groupId === 'grp_admin') {
    const row = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id) as ServiceRow | undefined
    return !row ? reply.status(404).send({ error: 'Not found' }) : row
  }

  // Others use visibility checks
  const row = db.prepare(`
    SELECT s.* FROM services s
    LEFT JOIN group_service_visibility g ON s.id = g.service_id AND g.group_id = ?
    WHERE s.id = ? AND (g.service_id IS NULL OR s.id IN (
      SELECT id FROM services WHERE group_id IN (
        SELECT id FROM groups WHERE id IS NOT NULL
      )
    ))
  `).get(groupId, req.params.id) as ServiceRow | undefined

  if (!row) return reply.status(404).send({ error: 'Not found' })
  return row
})
```

---

### Fix #6: Add Concurrent Limits to Health Checks

**File**: `backend/src/routes/services.ts`

```bash
npm install p-limit --save
```

```typescript
import pLimit from 'p-limit'

const MAX_CONCURRENT_CHECKS = 10 // Prevent memory exhaustion

app.post('/api/services/check-all',
  {
    preHandler: [
      async (req, reply) => {
        // Rate limit: max 2 full checks per minute
        const key = `check-all:${req.ip}`
        const count = store.get(key) || 0
        if (count >= 2) {
          return reply.status(429).send({ error: 'Too many check-all requests' })
        }
        store.set(key, count + 1)
        setTimeout(() => store.delete(key), 60_000)
      }
    ]
  },
  async () => {
    const services = db.prepare('SELECT * FROM services WHERE check_enabled = 1').all() as ServiceRow[]
    const limit = pLimit(MAX_CONCURRENT_CHECKS)

    const results = await Promise.all(
      services.map(s => limit(async () => {
        try {
          const checkUrl = s.check_url || s.url
          const oldStatus = s.last_status
          const status = await pingService(checkUrl)

          if (status !== oldStatus) {
            if (status === 'offline') {
              app.log.warn({ id: s.id, name: s.name, url: checkUrl }, 'Service went offline')
            } else if (status === 'online') {
              app.log.info({ id: s.id, name: s.name }, 'Service back online')
            }
          }

          db.prepare('UPDATE services SET last_status = ?, last_checked = datetime(\'now\') WHERE id = ?')
            .run(status, s.id)
          return { id: s.id, status }
        } catch (err) {
          app.log.error({ id: s.id, error: err.message }, 'Check failed')
          return { id: s.id, status: 'unknown' }
        }
      }))
    )

    return results
  }
)
```

**Testing**:
```bash
# First request: ✓ OK
curl -X POST http://localhost:8282/api/services/check-all

# Second request (within 1 min): ✓ OK
curl -X POST http://localhost:8282/api/services/check-all

# Third request (within 1 min): ✗ 429 Too Many Requests
curl -X POST http://localhost:8282/api/services/check-all
```

---

## Phase 3: Headers & Deployment Hardening (Week 3)

### Fix #7: Add HSTS and Security Headers

**File**: `backend/src/server.ts` (update Helmet config, line 91-93)

**Before**:
```typescript
await app.register(helmet, {
  contentSecurityPolicy: false,
})
```

**After**:
```typescript
await app.register(helmet, {
  contentSecurityPolicy: false, // Managed by nginx-proxy-manager
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'no-referrer' },
  frameguard: {
    action: 'deny', // Prevent clickjacking
  },
  noSniff: true,
  xssFilter: true,
})
```

**Add production check**:
```typescript
if (NODE_ENV === 'production' && process.env.SECURE_COOKIES !== 'true') {
  app.log.error({
    issue: 'SECURE_COOKIES not set to true in production',
    recommendation: 'Set SECURE_COOKIES=true when using HTTPS/TLS',
  }, '⚠️  SECURITY WARNING')
}
```

---

### Fix #8: Add Audit Logging

**File**: `backend/src/utils/audit.ts` (NEW FILE)

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify'
import { getDb } from '../db/database'

export interface AuditLog {
  timestamp: string
  user_id: string | null
  username: string | null
  action: string
  resource_type: string
  resource_id: string | null
  status: 'success' | 'failure'
  details: string | null
}

export function logAudit(app: FastifyInstance, req: FastifyRequest, log: Partial<AuditLog>) {
  const db = getDb()
  const user_id = req.user?.sub || null
  const username = req.user?.username || null

  const auditEntry: AuditLog = {
    timestamp: new Date().toISOString(),
    user_id,
    username,
    action: log.action || 'unknown',
    resource_type: log.resource_type || 'unknown',
    resource_id: log.resource_id || null,
    status: log.status || 'success',
    details: log.details || null,
  }

  try {
    db.prepare(`
      INSERT INTO audit_logs (timestamp, user_id, username, action, resource_type, resource_id, status, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditEntry.timestamp,
      auditEntry.user_id,
      auditEntry.username,
      auditEntry.action,
      auditEntry.resource_type,
      auditEntry.resource_id,
      auditEntry.status,
      auditEntry.details
    )
  } catch (err) {
    app.log.error({ error: err }, 'Failed to log audit entry')
  }

  // Also emit important actions to logs for real-time alerting
  if (['delete', 'auth_login', 'auth_logout', 'user_created', 'password_changed'].includes(log.action || '')) {
    app.log.info({
      audit: true,
      ...auditEntry,
    })
  }
}
```

**Usage in routes**:
```typescript
import { logAudit } from '../utils/audit'

// In DELETE handler:
app.delete<{ Params: { id: string } }>('/api/services/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id)
  if (!service) return reply.status(404).send({ error: 'Not found' })

  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id)

  logAudit(app, req, {
    action: 'service_deleted',
    resource_type: 'service',
    resource_id: req.params.id,
    status: 'success',
    details: `Deleted service: ${service.name}`,
  })

  return reply.status(204).send()
})

// In auth login:
logAudit(app, req, {
  action: 'auth_login',
  resource_type: 'auth',
  resource_id: user.id,
  status: 'success',
  details: `User ${user.username} logged in`,
})

// On auth failure:
logAudit(app, req, {
  action: 'auth_login_failed',
  resource_type: 'auth',
  resource_id: null,
  status: 'failure',
  details: `Failed login attempt for username: ${username}`,
})
```

---

## Testing & Validation Checklist

After implementing all fixes:

```bash
# 1. Run TypeScript compiler
cd backend
npm run build  # should have 0 errors

# 2. Run frontend build
cd ../frontend
npm run build  # should have 0 errors

# 3. Security audit
cd ../backend
npm audit  # review and fix critical vulnerabilities

# 4. Test authentication
curl -X POST http://localhost:8282/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"test123"}'

# 5. Test CSRF protection
curl -X POST http://localhost:8282/api/services \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","url":"http://test.local"}'
# Should return 403 if no CSRF token

# 6. Test rate limiting
for i in {1..7}; do
  curl -X POST http://localhost:8282/api/auth/login \
    -d '{"username":"x","password":"x"}'
done
# 6th+ should return 429

# 7. Test input validation
curl -X POST http://localhost:8282/api/services \
  -d '{"name":"Test","url":"javascript:alert(1)"}'
# Should return 400
```

---

## Monitoring After Deployment

Set up alerts for:
- ❌ Failed login attempts (threshold: >5 per 15 min per IP)
- ❌ CSRF token validation failures
- ❌ Service check-all operations (could indicate scanning)
- ⚠️ Health check timeouts
- ⚠️ Slow responses (>1s)

---

## References

- Express rate limit: https://github.com/nfriedly/express-rate-limit
- Fastify CSRF: https://github.com/fastify/fastify-csrf-protection
- OWASP Input Validation: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
