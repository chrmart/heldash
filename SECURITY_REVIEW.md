# HELDASH Security Review & Recommendations

**Date**: March 2026
**Scope**: Backend API, Authentication, Data Protection, Infrastructure
**Assessment Level**: Moderate Risk Homelab Environment

---

## Executive Summary

HELDASH demonstrates **solid baseline security practices** with prepared statements, credential protection, secure password hashing, and httpOnly cookies. However, several medium-risk vulnerabilities and best-practice gaps exist that should be addressed before production deployment in multi-user environments.

**Critical Issues**: 0
**High-Risk Issues**: 0
**Medium-Risk Issues**: 7
**Low-Risk Issues**: 4

---

## Detailed Findings

### 1. ⚠️ MEDIUM: Missing CSRF Protection (CORS Disabled)

**Severity**: MEDIUM
**Component**: `server.ts` line 96-98

```typescript
// Current:
await app.register(cors, {
  origin: NODE_ENV === 'development' ? true : false,
})
```

**Issue**: CORS is disabled in production (`origin: false`), but there's no CSRF token validation. A malicious website could trick an authenticated user into making unwanted requests via form submission (form-based CSRF attacks are not blocked by same-site cookies if SameSite is not strict).

**Risk**:
- User's dashboard/settings modified via malicious site
- Services deleted without user knowledge
- Widget credentials exposed if attacker can access admin area

**Recommendation**:
```typescript
// Add CSRF protection middleware
import fastifyCsrfProtection from '@fastify/csrf-protection'

await app.register(fastifyCsrfProtection, {
  // Fastify's CSRF adds double-submit cookie pattern
})

// Apply to all state-changing routes:
app.post('/api/services', { preHandler: [app.authenticate, app.csrfProtection] }, ...)
app.patch('/api/services/:id', { preHandler: [app.authenticate, app.csrfProtection] }, ...)
// etc.
```

OR tighten cookie SameSite:
```typescript
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict' as const, // Changed from 'lax'
  path: '/',
  maxAge: 86400,
}
```

---

### 2. ⚠️ MEDIUM: Weak Cookie SameSite Policy

**Severity**: MEDIUM
**Component**: `routes/auth.ts` line 35

```typescript
// Current:
sameSite: 'lax' as const,
```

**Issue**: `SameSite=Lax` allows cross-site requests on top-level navigation. Attackers can use `<a href="...">` links or form `GET` requests to exploit cross-site features.

**Recommendation**:
```typescript
sameSite: 'strict' as const, // Blocks all cross-site cookie access
```

**Note**: Only use 'lax' if HELDASH is embedded in iframes or used as an OAuth provider.

---

### 3. ⚠️ MEDIUM: Insufficient Input Validation

**Severity**: MEDIUM
**Component**: `routes/services.ts` lines 113-114

```typescript
// Current:
if (!name || !url) return reply.status(400).send({ error: 'name and url are required' })
```

**Issues**:
1. No URL format validation (invalid `javascript:`, `data:`, `file://` schemes allowed)
2. No length limits on string fields
3. No sanitization of user-controlled data before logging

**Risk**:
- XSS if URLs are rendered unsafely in templates
- DoS via extremely long strings
- Information leakage via error messages

**Recommendation**:
```typescript
import { URL } from 'url'

interface ValidatedService {
  name: string
  url: string
  description?: string
  tags?: string[]
}

function validateService(input: unknown): ValidatedService {
  const body = input as Record<string, unknown>

  // Validate name
  const name = body.name as string | undefined
  if (!name?.trim() || name.length > 255) {
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
  } catch {
    throw new Error('Invalid URL format')
  }

  // Validate description
  const description = body.description as string | undefined
  if (description && description.length > 500) {
    throw new Error('description max 500 characters')
  }

  // Validate tags
  const tags = body.tags as unknown[]
  if (tags && (!Array.isArray(tags) || tags.some(t => typeof t !== 'string' || t.length > 50))) {
    throw new Error('tags must be string array, max 50 chars each')
  }

  return { name: name.trim(), url, description: description?.trim(), tags }
}

// Usage in route:
app.post('/api/services', { preHandler: [app.authenticate] }, async (req, reply) => {
  try {
    const validated = validateService(req.body)
    // ... rest of logic
  } catch (err) {
    return reply.status(400).send({ error: err.message })
  }
})
```

---

### 4. ⚠️ MEDIUM: Unprotected Public Endpoints Leak Information

**Severity**: MEDIUM
**Component**: `routes/services.ts` lines 104-109

```typescript
// Current - service details are publicly readable:
app.get<{ Params: { id: string } }>('/api/services/:id', async (req, reply) => {
  const row = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id) as ServiceRow | undefined
  if (!resource) return reply.status(404).send({ error: 'Not found' })
  return row // ← NO GROUP VISIBILITY CHECK
})
```

**Issue**: Individual service details are publicly accessible without group visibility checks. While services are filtered in the LIST endpoint, the GET endpoint bypasses those checks.

**Risk**:
- Enumeration of all service IDs via brute-force (36 char nanoid = low entropy on small DBs)
- Information disclosure (URLs, internal hostnames, descriptions)

**Recommendation**:
```typescript
app.get<{ Params: { id: string } }>('/api/services/:id', async (req, reply) => {
  // Determine caller's group
  let groupId = 'grp_guest'
  try {
    await req.jwtVerify()
    groupId = req.user.groupId ?? 'grp_guest'
  } catch { /* guest access */ }

  const service = db.prepare(`
    SELECT s.* FROM services s
    LEFT JOIN group_service_visibility g ON s.id = g.service_id AND g.group_id = ?
    WHERE s.id = ? AND g.service_id IS NULL
  `).get(groupId, req.params.id) as ServiceRow | undefined

  if (!service) return reply.status(404).send({ error: 'Not found' })
  return service
})
```

---

### 5. ⚠️ MEDIUM: No Rate Limiting on Authentication Endpoints

**Severity**: MEDIUM
**Component**: `routes/auth.ts` (login, setup)

**Issue**: Login endpoint allows unlimited failed attempts. Brute-force attacks on user passwords are not throttled.

**Risk**:
- Credential enumeration (test if username exists)
- Password brute-force (weak passwords = compromised account)
- DoS via credential stuffing

**Recommendation**:
```bash
npm install @fastify/rate-limit
```

```typescript
import rateLimit from '@fastify/rate-limit'

await app.register(rateLimit, {
  max: 5, // max 5 requests per window
  timeWindow: '15 minutes'
})

// Apply stricter limits to auth:
app.post('/api/auth/login',
  {
    preHandler: rateLimit({
      max: 5,
      timeWindow: '15 minutes',
      skipOnError: true,
      allowList: [] // no IPs exempted
    })
  },
  authLoginHandler
)

app.post('/api/auth/setup',
  {
    preHandler: rateLimit({
      max: 3,
      timeWindow: '1 hour'
    })
  },
  authSetupHandler
)
```

---

### 6. ⚠️ MEDIUM: Service Health Check DoS Vulnerability

**Severity**: MEDIUM
**Component**: `routes/services.ts` lines 178-224

```typescript
// Current:
const pingAgent = new Agent({
  headersTimeout: 5_000,
  bodyTimeout: 5_000,
  // ...
})

app.post('/api/services/check-all', async () => {
  const services = db.prepare('SELECT * FROM services WHERE check_enabled = 1').all()
  const results = await Promise.all(
    services.map(async (s) => {
      // Each request can hang for 5 seconds × number of services
      const status = await pingService(checkUrl)
    })
  )
})
```

**Issue**:
- No limit on number of concurrent health checks
- Each check can hang for 5 seconds
- If 1000 services enabled, this spawns 1000 concurrent requests → memory exhaust → DoS

**Risk**:
- Memory exhaustion (`Promise.all` with 1000+ concurrent requests)
- Unresponsive dashboard during bulk health checks
- Attacker can trigger expensive check-all endpoint repeatedly

**Recommendation**:
```bash
npm install p-limit
```

```typescript
import pLimit from 'p-limit'

const MAX_CONCURRENT_CHECKS = 10 // limit concurrent health checks

app.post('/api/services/check-all', async () => {
  const services = db.prepare('SELECT * FROM services WHERE check_enabled = 1').all() as ServiceRow[]

  const limit = pLimit(MAX_CONCURRENT_CHECKS)
  const results = await Promise.all(
    services.map(s => limit(async () => {
      const checkUrl = s.check_url || s.url
      const status = await pingService(checkUrl)
      db.prepare('UPDATE services SET last_status = ?, last_checked = datetime(\'now\') WHERE id = ?')
        .run(status, s.id)
      return { id: s.id, status }
    }))
  )

  return results
})
```

Also add rate limiting to prevent repeated calls:
```typescript
app.post('/api/services/check-all',
  {
    preHandler: rateLimit({
      max: 2,
      timeWindow: '1 minute' // max 2 full checks per minute
    })
  },
  checkAllHandler
)
```

---

### 7. ⚠️ MEDIUM: File Upload Path Traversal (Partial Mitigation)

**Severity**: MEDIUM (Mostly Mitigated)
**Component**: `routes/services.ts` lines 260-261

```typescript
// Current (GOOD):
const filename = `${req.params.id}.${ext}`
fs.writeFileSync(path.join(iconsDir, filename), buffer)

// But deletion uses path.basename() which is correct:
const filename = path.basename(service.icon_url) // ✓ Safe
```

**Status**: ✓ Already protected via `path.basename()` and `req.params.id` (nanoid).

**Recommendation - Document this explicitly**:
```typescript
// Add comment:
// SECURITY: filename uses service ID (nanoid) + whitelist extension
// Prevents path traversal like "../../../etc/passwd.png"
const filename = `${req.params.id}.${ext}`
```

---

### 8. ⚠️ MEDIUM: Missing HTTPS Enforcement Headers

**Severity**: MEDIUM
**Component**: `server.ts` lines 91-93

```typescript
// Current:
await app.register(helmet, {
  contentSecurityPolicy: false, // Managed by nginx-proxy-manager
})
```

**Issue**: No HSTS (HTTP Strict-Transport-Security) header if accessed directly over HTTP. Users on insecure networks downgraded to HTTP.

**Recommendation**:
```typescript
await app.register(helmet, {
  contentSecurityPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'no-referrer' },
})

// Also warn in startup if SECURE_COOKIES is false in production:
if (NODE_ENV === 'production' && process.env.SECURE_COOKIES !== 'true') {
  app.log.error('SECURITY: SECURE_COOKIES=false in production! Set SECURE_COOKIES=true for HTTPS.')
}
```

---

## ✅ Strengths & Well-Implemented Areas

### SQL Injection Prevention
✓ **All queries use prepared statements** with parameterized values
✓ No string concatenation in SQL except table construction (safe)

```typescript
// Good:
db.prepare('SELECT * FROM services WHERE id = ?').get(id)
// Bad (not present):
db.prepare(`SELECT * FROM services WHERE id = '${id}'`) // NOT in codebase
```

### Credential Protection
✓ **API keys and passwords stripped before API responses**
```typescript
// widgets.ts sanitize():
if (r.type === 'adguard_home') {
  const { password: _p, ...safe } = rawConfig
  config = safe // password never sent to frontend
}
```

### Password Security
✓ **bcrypt cost 12** (strong hashing)
✓ **Minimum 8 character passwords**

```typescript
// auth.ts:
const password_hash = await bcrypt.hash(password, 12)
if (!password || password.length < 8) throw Error(...)
```

### Authentication & Authorization
✓ **JWT in httpOnly cookies** (immune to XSS)
✓ **@fastify/jwt** with proper decorators
✓ **Group-based access control** with sparse visibility tables

```typescript
// Prevents unauthorized access:
app.decorate('requireAdmin', async (req, reply) => {
  await req.jwtVerify()
  if (req.user.role !== 'admin') return reply.status(403).send(...)
})
```

### Secure Logging
✓ **Sensitive headers redacted** in logs (authorization, cookie)
```typescript
redact: {
  paths: ['req.headers.authorization', 'req.headers.cookie'],
  censor: '[REDACTED]',
}
```

### Docker Socket Access Control
✓ **Per-group Docker access** with DB checks
✓ **Admin always has access**

---

## 📋 Recommendations Summary (Priority Order)

| Priority | Issue | Component | Fix Effort | Impact |
|----------|-------|-----------|-----------|--------|
| 🔴 HIGH  | Add CSRF protection OR strict SameSite | auth.ts, server.ts | 2h | State-change attacks prevented |
| 🟠 MEDIUM | Rate limit auth endpoints | auth.ts | 1h | Brute-force protection |
| 🟠 MEDIUM | Concurrent health check limit | services.ts | 1.5h | DoS prevention |
| 🟠 MEDIUM | Strict input validation (URL format, lengths) | services.ts, widgets.ts | 2h | XSS/DoS prevention |
| 🟠 MEDIUM | Apply group visibility to GET/:id endpoints | services.ts, widgets.ts | 1h | Information disclosure prevention |
| 🟠 MEDIUM | Add HSTS + referrer headers | server.ts | 30min | HTTPS enforcement |
| 🟡 LOW | Add audit logging for sensitive operations | all admin routes | 2h | Compliance, breach investigation |
| 🟡 LOW | Secrets management for DOCKER_SOCKET path | server.ts | 30min | Config hardening |

---

## Deployment Checklist

Before deploying HELDASH to production:

- [ ] Generate strong `SECRET_KEY`: `openssl rand -hex 32`
- [ ] Set `SECURE_COOKIES=true` for HTTPS environments
- [ ] Enable `CSRF-Protection` middleware
- [ ] Set SameSite cookie to `strict`
- [ ] Add rate limiting to `/api/auth/*` routes
- [ ] Implement concurrent check limits with `p-limit`
- [ ] Add input validation helper with URL/length checks
- [ ] Apply group visibility checks to GET/:id endpoints
- [ ] Enable HSTS header in Helmet
- [ ] Add audit logging to sensitive endpoints
- [ ] Configure nginx-proxy-manager with TLS, CSP headers
- [ ] Set `NODE_ENV=production` in Docker
- [ ] Use `.env.production` for secrets (do NOT commit)
- [ ] Run security audit: `npm audit fix`
- [ ] Set up log aggregation/alerting for auth failures

---

## Security Best Practices for Homelab Deployment

### Network Layer
- Deploy behind **nginx-proxy-manager** with TLS 1.3
- Use **self-signed certificates** if needed (HELDASH handles via `rejectUnauthorized: false`)
- Restrict docker socket to localhost or container network only

### Database
- **Backup `/data/db/heldash.db` regularly** (no encryption at rest currently)
- Consider database encryption via VeraCrypt/LUKS if storing sensitive data
- Monitor database file permissions: `-rw------- heldash.db` (owner read/write only)

### Secrets Management
- **Never commit `.env` files** to Git
- Use Docker secrets or environment variables only
- Rotate `SECRET_KEY` annually (requires re-authentication)

### Monitoring & Alerting
- Log all auth failures, admin actions
- Alert on repeated failed logins (potential brute-force)
- Monitor health check failures (may indicate compromised services)

### Third-Party Integrations
- **AdGuard/Pi-hole passwords**: Store only in backend, never log
- **Nginx Proxy Manager API keys**: Same as above
- **Radarr/Sonarr/Prowlarr API keys**: Server-side only (✓ already implemented)

---

## Timeline for Fixes

**Phase 1 (Week 1 - Critical):**
- CSRF protection + SameSite strict
- Rate limiting on auth endpoints
- Input validation for URLs

**Phase 2 (Week 2 - Important):**
- Concurrent check limits
- Group visibility on GET/:id
- HSTS headers

**Phase 3 (Week 3 - Nice-to-have):**
- Audit logging
- Secrets management docs

---

## References

- OWASP Top 10: https://owasp.org/Top10/
- OWASP CSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- Fastify Security: https://fastify.dev/docs/latest/Guides/Security/
- SameSite Cookies: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite

---

**Document Version**: 1.0
**Last Updated**: March 2026
**Reviewer**: Security Analysis Tool
**Status**: Ready for Implementation
