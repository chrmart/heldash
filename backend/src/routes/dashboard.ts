import { FastifyInstance, FastifyRequest } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'

// ── DB row types ──────────────────────────────────────────────────────────────
interface DashboardItemRow {
  id: string
  type: string
  ref_id: string | null
  position: number
  owner_id: string
  created_at: string
}

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
interface CallerInfo {
  ownerId: string
  filterGroupId: string | null  // null = admin (no visibility filtering)
  canWrite: boolean
}

/**
 * Determines who is making the request and what they can do:
 * - Admin (own dashboard):     ownerId=sub,     filterGroupId=null,       canWrite=true
 * - Admin (?as=guest):         ownerId='guest',  filterGroupId='grp_guest', canWrite=true
 * - Regular user (own dash):   ownerId=sub,     filterGroupId=groupId,    canWrite=true
 * - grp_guest user:            ownerId='guest',  filterGroupId='grp_guest', canWrite=false
 * - Unauthenticated:           ownerId='guest',  filterGroupId='grp_guest', canWrite=false
 */
async function callerInfo(req: FastifyRequest): Promise<CallerInfo> {
  const asGuest = (req.query as Record<string, string>).as === 'guest'
  try {
    await req.jwtVerify()
    if (req.user.role === 'admin') {
      if (asGuest) return { ownerId: 'guest', filterGroupId: 'grp_guest', canWrite: true }
      return { ownerId: req.user.sub, filterGroupId: null, canWrite: true }
    }
    // Non-admin authenticated user
    const groupId = req.user.groupId ?? 'grp_guest'
    if (groupId === 'grp_guest') {
      return { ownerId: 'guest', filterGroupId: 'grp_guest', canWrite: false }
    }
    return { ownerId: req.user.sub, filterGroupId: groupId, canWrite: true }
  } catch {
    return { ownerId: 'guest', filterGroupId: 'grp_guest', canWrite: false }
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────
export async function dashboardRoutes(app: FastifyInstance) {
  const db = getDb()

  // GET /api/dashboard — ordered items with embedded data, filtered by owner and group visibility
  app.get('/api/dashboard', async (req) => {
    const { ownerId, filterGroupId } = await callerInfo(req)
    const items = db.prepare('SELECT * FROM dashboard_items WHERE owner_id = ? ORDER BY position').all(ownerId) as DashboardItemRow[]
    const result = []

    for (const item of items) {
      if (item.type === 'placeholder' || item.type === 'placeholder_app' || item.type === 'placeholder_instance' || item.type === 'placeholder_row') {
        result.push({ id: item.id, type: item.type, position: item.position })
        continue
      }

      if (item.type === 'widget' && item.ref_id) {
        if (filterGroupId !== null) {
          const hidden = db.prepare(
            'SELECT 1 FROM group_widget_visibility WHERE group_id = ? AND widget_id = ?'
          ).get(filterGroupId, item.ref_id)
          if (hidden) continue
        }
        const widget = db.prepare('SELECT * FROM widgets WHERE id = ?').get(item.ref_id) as WidgetRow | undefined
        if (!widget) continue
        result.push({
          id: item.id,
          type: 'widget',
          position: item.position,
          ref_id: item.ref_id,
          widget: {
            id: widget.id,
            type: widget.type,
            name: widget.name,
            config: JSON.parse(widget.config ?? '{}'),
            show_in_topbar: widget.show_in_topbar === 1,
            icon_url: widget.icon_url ?? null,
          },
        })
        continue
      }

      if (item.type === 'service' && item.ref_id) {
        if (filterGroupId !== null) {
          const hidden = db.prepare(
            'SELECT 1 FROM group_service_visibility WHERE group_id = ? AND service_id = ?'
          ).get(filterGroupId, item.ref_id)
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
        if (filterGroupId !== null) {
          const hidden = db.prepare(
            'SELECT 1 FROM group_arr_visibility WHERE group_id = ? AND instance_id = ?'
          ).get(filterGroupId, item.ref_id)
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

  // POST /api/dashboard/items — add item (authenticated, own dashboard)
  app.post('/api/dashboard/items', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { type, ref_id } = req.body as AddItemBody

    if (!['service', 'arr_instance', 'placeholder', 'placeholder_app', 'placeholder_instance', 'placeholder_row', 'widget'].includes(type)) {
      return reply.status(400).send({ error: 'Invalid type' })
    }
    const isPlaceholderType = type === 'placeholder' || type === 'placeholder_app' || type === 'placeholder_instance' || type === 'placeholder_row'
    if (!isPlaceholderType && !ref_id) {
      return reply.status(400).send({ error: 'ref_id required for service and arr_instance' })
    }

    // Prevent duplicates per owner
    if (ref_id) {
      const existing = db.prepare(
        'SELECT id FROM dashboard_items WHERE type = ? AND ref_id = ? AND owner_id = ?'
      ).get(type, ref_id, ownerId)
      if (existing) return reply.status(409).send({ error: 'Already on dashboard' })
    }

    const maxRow = db.prepare('SELECT MAX(position) as m FROM dashboard_items WHERE owner_id = ?').get(ownerId) as { m: number | null }
    const position = (maxRow.m ?? -1) + 1
    const id = nanoid()

    db.prepare('INSERT INTO dashboard_items (id, type, ref_id, position, owner_id) VALUES (?, ?, ?, ?, ?)').run(
      id, type, ref_id ?? null, position, ownerId
    )

    return { id, type, ref_id: ref_id ?? null, position }
  })

  // DELETE /api/dashboard/items/by-ref — remove by ref_id + type
  // Registered BEFORE :id to avoid parametric route capturing "by-ref"
  app.delete('/api/dashboard/items/by-ref', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { type, ref_id } = req.body as { type: string; ref_id: string }
    db.prepare('DELETE FROM dashboard_items WHERE type = ? AND ref_id = ? AND owner_id = ?').run(type, ref_id, ownerId)
    return reply.status(204).send()
  })

  // DELETE /api/dashboard/items/:id — remove item
  app.delete('/api/dashboard/items/:id', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { id } = req.params as { id: string }
    const item = db.prepare('SELECT id FROM dashboard_items WHERE id = ? AND owner_id = ?').get(id, ownerId)
    if (!item) return reply.status(404).send({ error: 'Not found' })
    db.prepare('DELETE FROM dashboard_items WHERE id = ?').run(id)
    return reply.status(204).send()
  })

  // PATCH /api/dashboard/reorder — bulk position update
  app.patch('/api/dashboard/reorder', async (req, reply) => {
    const { ownerId, canWrite } = await callerInfo(req)
    if (!canWrite) return reply.status(403).send({ error: 'Forbidden' })

    const { ids } = req.body as ReorderBody
    if (!Array.isArray(ids)) return reply.status(400).send({ error: 'ids must be an array' })
    const update = db.prepare('UPDATE dashboard_items SET position = ? WHERE id = ? AND owner_id = ?')
    const runAll = db.transaction(() => { ids.forEach((id, i) => update.run(i, id, ownerId)) })
    runAll()
    return { ok: true }
  })
}
