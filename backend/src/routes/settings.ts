import { FastifyInstance } from 'fastify'
import { getDb } from '../db/database'

export async function settingsRoutes(app: FastifyInstance) {
  const db = getDb()

  app.get('/api/settings', async () => {
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    return Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]))
  })

  app.patch<{ Body: Record<string, any> }>('/api/settings', async (req) => {
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))')
    for (const [key, value] of Object.entries(req.body)) {
      upsert.run(key, JSON.stringify(value))
    }
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    return Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]))
  })
}
