import { FastifyInstance } from 'fastify'
import { getDb } from '../db/database'
import { nanoid } from 'nanoid'

export async function groupsRoutes(app: FastifyInstance) {
  const db = getDb()

  app.get('/api/groups', async () => {
    return db.prepare('SELECT * FROM groups ORDER BY position').all()
  })

  app.post<{ Body: any }>('/api/groups', async (req, reply) => {
    const { name, icon, position } = req.body
    if (!name) return reply.status(400).send({ error: 'name is required' })
    const id = nanoid()
    db.prepare('INSERT INTO groups (id, name, icon, position) VALUES (?, ?, ?, ?)').run(id, name, icon ?? null, position ?? 0)
    return reply.status(201).send(db.prepare('SELECT * FROM groups WHERE id = ?').get(id))
  })

  app.patch<{ Params: { id: string }; Body: any }>('/api/groups/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id)
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    const { name, icon, position } = req.body
    db.prepare('UPDATE groups SET name = COALESCE(?, name), icon = COALESCE(?, icon), position = COALESCE(?, position), updated_at = datetime(\'now\') WHERE id = ?')
      .run(name ?? null, icon ?? null, position ?? null, req.params.id)
    return db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id)
  })

  app.delete<{ Params: { id: string } }>('/api/groups/:id', async (req, reply) => {
    db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id)
    return reply.status(204).send()
  })
}
