import { FastifyInstance, FastifyRequest } from 'fastify'
import { nanoid } from 'nanoid'
import { promises as fsp } from 'fs'
import fs from 'fs'
import path from 'path'
import { getDb } from '../db/database'

const DATA_DIR = process.env.DATA_DIR ?? '/data'

// ── DB row types ──────────────────────────────────────────────────────────────
interface WidgetRow {
  id: string
  type: string
  name: string
  config: string
  position: number
  show_in_topbar: number
  icon_url: string | null
  created_at: string
  updated_at: string
}

// ── Request body types ────────────────────────────────────────────────────────
interface CreateWidgetBody {
  type: string
  name: string
  config?: Record<string, unknown>
  show_in_topbar?: boolean
}

interface PatchWidgetBody {
  name?: string
  config?: Record<string, unknown>
  show_in_topbar?: boolean
  position?: number
}

interface AdGuardProtectionBody {
  enabled: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitize(r: WidgetRow) {
  const rawConfig = JSON.parse(r.config ?? '{}')
  // Strip password from adguard_home configs — credentials never leave the backend
  const config = r.type === 'adguard_home'
    ? (({ password: _p, ...safe }) => safe)(rawConfig)
    : rawConfig
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    config,
    position: r.position,
    show_in_topbar: r.show_in_topbar === 1,
    icon_url: r.icon_url ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

async function callerGroupId(req: FastifyRequest): Promise<string | null> {
  try {
    await req.jwtVerify()
    if (req.user.role === 'admin') return null
    return req.user.groupId ?? 'grp_guest'
  } catch {
    return 'grp_guest'
  }
}

// ── Server Status helpers (Linux /proc + fs.statfs) ───────────────────────────

function parseProcStat(raw: string): { total: number; idle: number } {
  const line = raw.split('\n')[0]
  const parts = line.trim().split(/\s+/).slice(1).map(Number)
  const idle = parts[3] + (parts[4] ?? 0)
  const total = parts.reduce((a, b) => a + b, 0)
  return { total, idle }
}

async function getCpuLoad(): Promise<number> {
  try {
    const raw1 = await fsp.readFile('/proc/stat', 'utf8')
    const s1 = parseProcStat(raw1)
    await new Promise(r => setTimeout(r, 200))
    const raw2 = await fsp.readFile('/proc/stat', 'utf8')
    const s2 = parseProcStat(raw2)
    const dTotal = s2.total - s1.total
    const dIdle = s2.idle - s1.idle
    if (dTotal === 0) return 0
    return Math.round(((dTotal - dIdle) / dTotal) * 1000) / 10
  } catch {
    return -1
  }
}

async function getRam(): Promise<{ total: number; used: number; free: number }> {
  try {
    const raw = await fsp.readFile('/proc/meminfo', 'utf8')
    const getValue = (key: string): number => {
      const match = raw.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))
      return match ? parseInt(match[1], 10) : 0
    }
    const totalKb = getValue('MemTotal')
    const availKb = getValue('MemAvailable')
    const total = Math.round(totalKb / 1024)
    const free = Math.round(availKb / 1024)
    const used = total - free
    return { total, used, free }
  } catch {
    return { total: 0, used: 0, free: 0 }
  }
}

interface DiskConfig { path: string; name: string }
interface DiskStats extends DiskConfig { total: number; used: number; free: number }

async function getDiskStats(disks: DiskConfig[]): Promise<DiskStats[]> {
  return Promise.all(disks.map(async disk => {
    try {
      const stat = await fsp.statfs(disk.path)
      const blockSize = stat.bsize
      const total = Math.round((stat.blocks * blockSize) / (1024 * 1024))
      const free = Math.round((stat.bavail * blockSize) / (1024 * 1024))
      const used = total - free
      return { path: disk.path, name: disk.name, total, used, free }
    } catch {
      return { path: disk.path, name: disk.name, total: 0, used: 0, free: 0 }
    }
  }))
}

// ── AdGuard Home helpers ───────────────────────────────────────────────────────

interface AdGuardStatsResult {
  total_queries: number
  blocked_queries: number
  blocked_percent: number
  protection_enabled: boolean
}

async function getAdGuardStats(url: string, username: string, password: string): Promise<AdGuardStatsResult> {
  const errResult: AdGuardStatsResult = {
    total_queries: -1, blocked_queries: -1, blocked_percent: -1, protection_enabled: false,
  }
  if (!url) return errResult

  const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
  const headers = { Authorization: auth }
  const base = url.replace(/\/$/, '')

  try {
    const [statsRes, statusRes] = await Promise.all([
      fetch(`${base}/control/stats`, { headers }),
      fetch(`${base}/control/status`, { headers }),
    ])
    if (!statsRes.ok || !statusRes.ok) return errResult

    const statsData = await statsRes.json() as Record<string, unknown>
    const statusData = await statusRes.json() as Record<string, unknown>

    const total = typeof statsData.num_dns_queries === 'number' ? statsData.num_dns_queries : 0
    const blocked = typeof statsData.num_blocked_filtering === 'number' ? statsData.num_blocked_filtering : 0
    const blocked_percent = total > 0 ? Math.round((blocked / total) * 1000) / 10 : 0

    return {
      total_queries: total,
      blocked_queries: blocked,
      blocked_percent,
      protection_enabled: statusData.protection_enabled === true,
    }
  } catch {
    return errResult
  }
}

async function setAdGuardProtection(url: string, username: string, password: string, enabled: boolean): Promise<boolean> {
  if (!url) return false
  const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
  const base = url.replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/control/protection`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────
export async function widgetsRoutes(app: FastifyInstance) {
  const db = getDb()

  // GET /api/widgets — filtered by group visibility
  app.get('/api/widgets', async (req) => {
    const groupId = await callerGroupId(req)
    const all = db.prepare('SELECT * FROM widgets ORDER BY position, created_at').all() as WidgetRow[]
    if (groupId === null) return all.map(sanitize)
    const hidden = new Set(
      (db.prepare('SELECT widget_id FROM group_widget_visibility WHERE group_id = ?').all(groupId) as { widget_id: string }[])
        .map(r => r.widget_id)
    )
    return all.filter(r => !hidden.has(r.id)).map(sanitize)
  })

  // POST /api/widgets — create (admin only)
  app.post('/api/widgets', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const { type, name, config = {}, show_in_topbar = false } = req.body as CreateWidgetBody
    if (!['server_status', 'adguard_home'].includes(type)) {
      return reply.status(400).send({ error: 'Invalid widget type' })
    }
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
    const maxRow = db.prepare('SELECT MAX(position) as m FROM widgets').get() as { m: number | null }
    const position = (maxRow.m ?? -1) + 1
    const id = nanoid()
    db.prepare(`
      INSERT INTO widgets (id, type, name, config, position, show_in_topbar)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, type, name.trim(), JSON.stringify(config), position, show_in_topbar ? 1 : 0)
    const row = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as WidgetRow
    return reply.status(201).send(sanitize(row))
  })

  // PATCH /api/widgets/:id — update (admin only)
  app.patch('/api/widgets/:id', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as WidgetRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    const { name, config, show_in_topbar, position } = req.body as PatchWidgetBody

    // For adguard_home: if password is empty in the patch, merge with existing config to preserve it
    let configToStore: string | null = null
    if (config !== undefined) {
      if (row.type === 'adguard_home') {
        const existing = JSON.parse(row.config ?? '{}')
        const merged = { ...existing, ...config }
        // If new password is empty string, keep existing password
        if (!merged.password) merged.password = existing.password ?? ''
        configToStore = JSON.stringify(merged)
      } else {
        configToStore = JSON.stringify(config)
      }
    }

    db.prepare(`
      UPDATE widgets SET
        name           = COALESCE(?, name),
        config         = COALESCE(?, config),
        show_in_topbar = COALESCE(?, show_in_topbar),
        position       = COALESCE(?, position),
        updated_at     = datetime('now')
      WHERE id = ?
    `).run(
      name?.trim() ?? null,
      configToStore,
      show_in_topbar !== undefined ? (show_in_topbar ? 1 : 0) : null,
      position ?? null,
      id
    )
    const updated = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as WidgetRow
    return sanitize(updated)
  })

  // DELETE /api/widgets/:id — delete + cascade (admin only)
  app.delete('/api/widgets/:id', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as WidgetRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    // Delete icon file if present
    if (row.icon_url) {
      const filename = path.basename(row.icon_url)
      const filePath = path.join(DATA_DIR, 'icons', filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    db.prepare('DELETE FROM dashboard_items WHERE type = ? AND ref_id = ?').run('widget', id)
    db.prepare('DELETE FROM group_widget_visibility WHERE widget_id = ?').run(id)
    db.prepare('DELETE FROM widgets WHERE id = ?').run(id)
    return reply.status(204).send()
  })

  // GET /api/widgets/:id/stats — live stats, branched by widget type
  app.get('/api/widgets/:id/stats', async (req, reply) => {
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as WidgetRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })

    const config = JSON.parse(row.config ?? '{}')

    if (row.type === 'adguard_home') {
      return getAdGuardStats(config.url ?? '', config.username ?? '', config.password ?? '')
    }

    // server_status (default)
    const disks: DiskConfig[] = Array.isArray(config.disks) ? config.disks : []
    const [cpu, ram, diskStats] = await Promise.all([
      getCpuLoad(),
      getRam(),
      getDiskStats(disks),
    ])
    return { cpu: { load: cpu }, ram, disks: diskStats }
  })

  // POST /api/widgets/:id/icon — upload icon image (base64 JSON, admin only)
  app.post('/api/widgets/:id/icon', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as WidgetRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })

    const { data, content_type } = req.body as { data: string; content_type: string }
    if (!data || !content_type) return reply.status(400).send({ error: 'data and content_type are required' })

    const extMap: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' }
    const ext = extMap[content_type]
    if (!ext) return reply.status(415).send({ error: 'Unsupported image type (PNG, JPG, SVG only)' })

    const buffer = Buffer.from(data, 'base64')
    if (buffer.length > 512 * 1024) return reply.status(413).send({ error: 'Image too large (max 512 KB)' })

    const iconsDir = path.join(DATA_DIR, 'icons')
    fs.mkdirSync(iconsDir, { recursive: true })

    // Delete old icon if present
    if (row.icon_url) {
      const oldPath = path.join(iconsDir, path.basename(row.icon_url))
      if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath) } catch { /* ignore */ } }
    }

    const filename = `widget_${id}.${ext}`
    fs.writeFileSync(path.join(iconsDir, filename), buffer)
    const icon_url = `/icons/${filename}`
    db.prepare("UPDATE widgets SET icon_url = ?, updated_at = datetime('now') WHERE id = ?").run(icon_url, id)
    return { icon_url }
  })

  // POST /api/widgets/:id/adguard/protection — toggle AdGuard protection (admin only)
  app.post('/api/widgets/:id/adguard/protection', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as WidgetRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (row.type !== 'adguard_home') return reply.status(400).send({ error: 'Not an AdGuard Home widget' })

    const { enabled } = req.body as AdGuardProtectionBody
    if (typeof enabled !== 'boolean') return reply.status(400).send({ error: 'enabled must be boolean' })

    const config = JSON.parse(row.config ?? '{}')
    const ok = await setAdGuardProtection(config.url ?? '', config.username ?? '', config.password ?? '', enabled)
    if (!ok) return reply.status(502).send({ error: 'Failed to reach AdGuard Home' })
    return { ok: true }
  })
}
