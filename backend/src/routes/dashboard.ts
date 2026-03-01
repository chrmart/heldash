import { FastifyInstance, FastifyRequest } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'

// ── DB row types ──────────────────────────────────────────────────────────────
interface DashboardItemRow {
  id: string
  type: string
  ref_id: string | null
  position: number
  created_at: string
}

interface ServiceRow {
  id: string
  group_id: string | null
  name: string
  url: string
  icon: string | null
  icon_url: string | null
  description: string | null
  last_status: string | null
  last_checked: string | null
  check_enabled: number
  check_url: string | null
  check_interval: number
  position_x: number
  position_y: number
  tags: string
}

interface ArrInstanceRow {
  id: string
  type: string
  name: string
  url: string
  enabled: number
}

// ── Request body types ────────────────────────────────────────────────────────
interface AddItemBody {
  type: string
  ref_id?: string
}

interface ReorderBody {
  ids: string[]
}

// ── Helper ────────────────────────────────────────────────────────────────────
/** Returns null for admins (no filtering), groupId string for all others */
async function callerGroupId(req: FastifyRequest): Promise<string | null> {
  try {
    await req.jwtVerify()
    if (req.user.role === 'admin') return null
    return req.user.groupId ?? 'grp_guest'
  } catch {
    return 'grp_guest'
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────
export async function dashboardRoutes(app: FastifyInstance) {
  const db = getDb()

  // GET /api/dashboard — ordered items with embedded data, filtered by group visibility
  app.get('/api/dashboard', async (req) => {
    const groupId = await callerGroupId(req)
    const items = db.prepare('SELECT * FROM dashboard_items ORDER BY position').all() as DashboardItemRow[]
    const result = []

    for (const item of items) {
      if (item.type === 'placeholder') {
        result.push({ id: item.id, type: 'placeholder', position: item.position })
        continue
      }

      if (item.type === 'service' && item.ref_id) {
        // Visibility check for non-admins
        if (groupId !== null) {
          const hidden = db.prepare(
            'SELECT 1 FROM group_service_visibility WHERE group_id = ? AND service_id = ?'
          ).get(groupId, item.ref_id)
          if (hidden) continue
        }
        const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(item.ref_id) as ServiceRow | undefined
        if (!svc) continue
        result.push({
          id: item.id,
          type: 'service',
          position: item.position,
          ref_id: item.ref_id,
          service: {
            ...svc,
            check_enabled: svc.check_enabled === 1,
            tags: JSON.parse(svc.tags ?? '[]'),
          },
        })
        continue
      }

      if (item.type === 'arr_instance' && item.ref_id) {
        // Visibility check for non-admins
        if (groupId !== null) {
          const hidden = db.prepare(
            'SELECT 1 FROM group_arr_visibility WHERE group_id = ? AND instance_id = ?'
          ).get(groupId, item.ref_id)
          if (hidden) continue
        }
        const inst = db.prepare(
          'SELECT id, type, name, url, enabled FROM arr_instances WHERE id = ?'
        ).get(item.ref_id) as ArrInstanceRow | undefined
        if (!inst) continue
        result.push({
          id: item.id,
          type: 'arr_instance',
          position: item.position,
          ref_id: item.ref_id,
          instance: { ...inst, enabled: inst.enabled === 1 },
        })
        continue
      }
    }

    return result
  })

  // POST /api/dashboard/items — add item (admin only)
  app.post('/api/dashboard/items', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { type, ref_id } = req.body as AddItemBody

    if (!['service', 'arr_instance', 'placeholder'].includes(type)) {
      return reply.status(400).send({ error: 'Invalid type' })
    }
    if (type !== 'placeholder' && !ref_id) {
      return reply.status(400).send({ error: 'ref_id required for service and arr_instance' })
    }

    // Prevent duplicates for service/arr_instance
    if (ref_id) {
      const existing = db.prepare(
        'SELECT id FROM dashboard_items WHERE type = ? AND ref_id = ?'
      ).get(type, ref_id)
      if (existing) return reply.status(409).send({ error: 'Already on dashboard' })
    }

    const maxRow = db.prepare('SELECT MAX(position) as m FROM dashboard_items').get() as { m: number | null }
    const position = (maxRow.m ?? -1) + 1
    const id = nanoid()

    db.prepare('INSERT INTO dashboard_items (id, type, ref_id, position) VALUES (?, ?, ?, ?)').run(
      id, type, ref_id ?? null, position
    )

    return { id, type, ref_id: ref_id ?? null, position }
  })

  // DELETE /api/dashboard/items/by-ref — remove by ref_id + type (admin only)
  // Registered BEFORE :id to avoid parametric route capturing "by-ref"
  app.delete('/api/dashboard/items/by-ref', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { type, ref_id } = req.body as { type: string; ref_id: string }
    db.prepare('DELETE FROM dashboard_items WHERE type = ? AND ref_id = ?').run(type, ref_id)
    return reply.status(204).send()
  })

  // DELETE /api/dashboard/items/:id — remove item (admin only)
  app.delete('/api/dashboard/items/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const item = db.prepare('SELECT id FROM dashboard_items WHERE id = ?').get(id)
    if (!item) return reply.status(404).send({ error: 'Not found' })
    db.prepare('DELETE FROM dashboard_items WHERE id = ?').run(id)
    return reply.status(204).send()
  })

  // PATCH /api/dashboard/reorder — bulk position update (admin only)
  app.patch('/api/dashboard/reorder', { preHandler: app.requireAdmin }, async (req, reply) => {
    const { ids } = req.body as ReorderBody
    if (!Array.isArray(ids)) return reply.status(400).send({ error: 'ids must be an array' })
    const update = db.prepare('UPDATE dashboard_items SET position = ? WHERE id = ?')
    const runAll = db.transaction(() => { ids.forEach((id, i) => update.run(i, id)) })
    runAll()
    return { ok: true }
  })
}
