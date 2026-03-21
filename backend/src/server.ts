import Fastify, { FastifyRequest, FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import staticFiles from '@fastify/static'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import path from 'path'
import fs from 'fs'
import { initDb } from './db/database'
import { servicesRoutes } from './routes/services'
import { groupsRoutes } from './routes/groups'
import { settingsRoutes } from './routes/settings'
import { authRoutes } from './routes/auth'
import { usersRoutes } from './routes/users'
import { arrRoutes } from './routes/arr'
import { dashboardRoutes } from './routes/dashboard'
import { widgetsRoutes } from './routes/widgets'
import { dockerRoutes, initDockerPoller } from './routes/docker'
import { backgroundsRoutes } from './routes/backgrounds'
import { haRoutes } from './routes/ha'
import { tmdbRoutes } from './routes/tmdb'
import recyclarrRoutes, { initRecyclarrSchedulers } from './routes/recyclarr'
import { activityRoutes } from './routes/activity'

let _appVersion = '0.0.0'
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')) as { version: string }
  _appVersion = pkg.version
} catch { /* ignore */ }

const PORT = parseInt(process.env.PORT ?? '8282', 10)
const DATA_DIR = process.env.DATA_DIR ?? '/data'
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'
// LOG_FORMAT=json → raw JSON (for log aggregators); default: pino-pretty
const LOG_FORMAT = process.env.LOG_FORMAT ?? 'pretty'
const NODE_ENV = process.env.NODE_ENV ?? 'development'
const SECRET_KEY = process.env.SECRET_KEY || 'heldash-dev-secret-change-in-production'
const DOCKER_SOCKET = '/var/run/docker.sock'

async function start() {
  const migrationsApplied = initDb(DATA_DIR)

  const app = Fastify({
    logger: {
      level: LOG_LEVEL,
      // Redact sensitive fields from all log output
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        censor: '[REDACTED]',
      },
      transport: LOG_FORMAT !== 'json'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
  })

  // ── Startup summary ──────────────────────────────────────────────────────────
  const dockerSocketPresent = fs.existsSync(DOCKER_SOCKET)
  app.log.info({
    port: PORT,
    dataDir: DATA_DIR,
    logLevel: LOG_LEVEL,
    logFormat: LOG_FORMAT,
    dockerSocket: dockerSocketPresent ? 'present' : 'missing',
    secretKey: process.env.SECRET_KEY ? 'set' : 'DEFAULT (insecure)',
    migrationsApplied,
    nodeEnv: NODE_ENV,
  }, 'HELDASH starting')

  if (!process.env.SECRET_KEY) {
    app.log.warn('SECRET_KEY not set — using insecure default. Set SECRET_KEY env var in production!')
  }
  if (!dockerSocketPresent) {
    app.log.warn(`Docker socket not found at ${DOCKER_SOCKET} — Docker features will be unavailable`)
  }
  if (migrationsApplied > 0) {
    app.log.info({ count: migrationsApplied }, 'DB migrations applied on startup')
  }

  // ── Slow request detection ───────────────────────────────────────────────────
  app.addHook('onResponse', (req, reply, done) => {
    if (reply.elapsedTime > 1000) {
      app.log.warn({
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      }, 'Slow response')
    }
    done()
  })

  // ── Rate limiting (global: false — only applied to routes with config.rateLimit) ──
  await app.register(rateLimit, { global: false })

  // ── Security headers ─────────────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // Managed by nginx-proxy-manager in production
  })

  // ── CORS ─────────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: NODE_ENV === 'development' ? true : false,
  })

  // ── Cookies (must be registered before JWT) ──────────────────────────────────
  await app.register(fastifyCookie)

  // ── JWT ──────────────────────────────────────────────────────────────────────
  await app.register(fastifyJwt, {
    secret: SECRET_KEY,
    cookie: {
      cookieName: 'auth_token',
      signed: false,
    },
  })

  // ── Auth decorators (available on all routes registered after this point) ────
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    if (req.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  })

  // ── Override JSON parser to accept empty bodies (prevents FST_ERR_CTP_EMPTY_JSON_BODY) ──
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || body === '') {
      done(null, {})
      return
    }
    try {
      done(null, JSON.parse(body as string))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  // ── Serve frontend static files ──────────────────────────────────────────────
  const publicPath = path.join(__dirname, '..', 'public')
  await app.register(staticFiles, {
    root: publicPath,
    prefix: '/',
  })

  // ── Serve uploaded background images ─────────────────────────────────────────
  app.get<{ Params: { filename: string } }>('/backgrounds/:filename', async (req, reply) => {
    const bgDir = path.join(DATA_DIR, 'backgrounds')
    const filePath = path.join(bgDir, path.basename(req.params.filename))
    if (!fs.existsSync(filePath)) return reply.status(404).send({ error: 'Not found' })
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
    }
    const ext = path.extname(filePath).toLowerCase()
    reply.header('Content-Type', mimeTypes[ext] ?? 'application/octet-stream')
    reply.header('Cache-Control', 'public, max-age=3600')
    return reply.send(fs.createReadStream(filePath))
  })

  // ── Serve uploaded service icons ─────────────────────────────────────────────
  app.get<{ Params: { filename: string } }>('/icons/:filename', async (req, reply) => {
    const iconsDir = path.join(DATA_DIR, 'icons')
    // path.basename prevents path traversal attacks
    const filePath = path.join(iconsDir, path.basename(req.params.filename))
    if (!fs.existsSync(filePath)) return reply.status(404).send({ error: 'Not found' })
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
    }
    const ext = path.extname(filePath).toLowerCase()
    reply.header('Content-Type', mimeTypes[ext] ?? 'application/octet-stream')
    reply.header('Cache-Control', 'public, max-age=3600')
    return reply.send(fs.createReadStream(filePath))
  })

  // ── Health check — silent (polled every 30s by Docker healthcheck) ────────────
  app.get('/api/health', { logLevel: 'silent' }, async () => ({
    status: 'ok',
    version: _appVersion,
    uptime: process.uptime(),
  }))

  // ── Server time — silent (polled by frontend clock, ~every 30s) ──────────────
  app.get('/api/time', { logLevel: 'silent' }, async () => ({ iso: new Date().toISOString() }))

  // ── API routes ───────────────────────────────────────────────────────────────
  await app.register(authRoutes)
  await app.register(usersRoutes)
  await app.register(servicesRoutes)
  await app.register(groupsRoutes)
  await app.register(arrRoutes)
  await app.register(dashboardRoutes)
  await app.register(widgetsRoutes)
  await app.register(dockerRoutes)
  await app.register(backgroundsRoutes)
  await app.register(settingsRoutes)
  await app.register(haRoutes)
  await app.register(tmdbRoutes)
  await app.register(recyclarrRoutes)
  await app.register(activityRoutes)

  // ── Recyclarr scheduled sync ─────────────────────────────────────────────────
  initRecyclarrSchedulers(app.log)

  // ── Docker container state poller (logs transitions to activity feed) ─────────
  if (dockerSocketPresent) {
    initDockerPoller()
  }

  // ── Global error handler — catches unhandled throws in route handlers ─────────
  app.setErrorHandler((error, request, reply) => {
    app.log.error({
      err: error,
      url: request.url,
      method: request.method,
    }, 'Unhandled error')
    reply.status(500).send({ error: 'Internal server error', detail: error.message })
  })

  // ── SPA fallback – serve index.html for all non-API routes ───────────────────
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api')) {
      return reply.status(404).send({ error: 'Not found' })
    }
    return reply.sendFile('index.html')
  })

  await app.listen({ port: PORT, host: '0.0.0.0' })
  app.log.info({ port: PORT }, 'HELDASH ready')

  // ── Graceful shutdown ────────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutdown signal received, closing server...')
    try {
      await app.close()
      app.log.info('Server closed gracefully')
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown')
    }
    process.exit(0)
  }
  process.on('SIGTERM', () => { shutdown('SIGTERM').catch(() => process.exit(1)) })
  process.on('SIGINT', () => { shutdown('SIGINT').catch(() => process.exit(1)) })
}

start().catch((err) => {
  console.error('Fatal error during startup:', err)
  process.exit(1)
})
