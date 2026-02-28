import Fastify, { FastifyRequest, FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import staticFiles from '@fastify/static'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import path from 'path'
import fs from 'fs'
import { initDb } from './db/database'
import { servicesRoutes } from './routes/services'
import { groupsRoutes } from './routes/groups'
import { settingsRoutes } from './routes/settings'
import { authRoutes } from './routes/auth'
import { usersRoutes } from './routes/users'

const PORT = parseInt(process.env.PORT ?? '8282', 10)
const DATA_DIR = process.env.DATA_DIR ?? '/data'
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'
const NODE_ENV = process.env.NODE_ENV ?? 'development'
const SECRET_KEY = process.env.SECRET_KEY ?? 'heldash-dev-secret-change-in-production'

async function start() {
  // Init DB
  initDb(DATA_DIR)

  const app = Fastify({
    logger: {
      level: LOG_LEVEL,
      transport: NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  })

  if (SECRET_KEY === 'heldash-dev-secret-change-in-production') {
    app.log.warn('SECRET_KEY is not set — using insecure default. Set SECRET_KEY env var in production!')
  }

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // Managed by nginx-proxy-manager in production
  })

  // CORS
  await app.register(cors, {
    origin: NODE_ENV === 'development' ? true : false,
  })

  // Cookies (must be registered before JWT)
  await app.register(fastifyCookie)

  // JWT
  await app.register(fastifyJwt, {
    secret: SECRET_KEY,
    cookie: {
      cookieName: 'auth_token',
      signed: false,
    },
  })

  // Auth decorators (available on all routes registered after this point)
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

  // Override JSON parser to accept empty bodies (prevents FST_ERR_CTP_EMPTY_JSON_BODY)
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

  // Serve frontend static files
  const publicPath = path.join(__dirname, '..', 'public')
  await app.register(staticFiles, {
    root: publicPath,
    prefix: '/',
  })

  // Serve uploaded service icons
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

  // Health check endpoint
  app.get('/api/health', async () => ({
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    uptime: process.uptime(),
  }))

  // API routes
  await app.register(authRoutes)
  await app.register(usersRoutes)
  await app.register(servicesRoutes)
  await app.register(groupsRoutes)
  await app.register(settingsRoutes)

  // SPA fallback – serve index.html for all non-API routes
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api')) {
      return reply.status(404).send({ error: 'Not found' })
    }
    return reply.sendFile('index.html')
  })

  await app.listen({ port: PORT, host: '0.0.0.0' })
  app.log.info(`HELDASH running on http://0.0.0.0:${PORT}`)
}

start().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
