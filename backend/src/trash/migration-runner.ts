// ── Parser schema migration ───────────────────────────────────────────────────
// If PARSER_SCHEMA_VERSION has increased since a cache row was written,
// re-parse the raw_data through the current parser to produce fresh normalized_data.

import { getDb } from '../db/database'
import { PARSER_SCHEMA_VERSION, hashConditions } from './trash-parser'
import type { TrashGuidesCache, NormalizedCustomFormat } from './types'

export function runParserMigrations(): number {
  const db = getDb()
  const stale = db.prepare(
    'SELECT * FROM trash_guides_cache WHERE schema_version < ?'
  ).all(PARSER_SCHEMA_VERSION) as TrashGuidesCache[]

  if (stale.length === 0) return 0

  let migrated = 0

  for (const row of stale) {
    try {
      if (row.category !== 'custom_formats') {
        // For quality profiles, migration is handled separately when CFs are migrated
        // Just bump schema_version so they aren't re-processed repeatedly
        db.prepare(
          `UPDATE trash_guides_cache SET schema_version = ? WHERE id = ?`
        ).run(PARSER_SCHEMA_VERSION, row.id)
        migrated++
        continue
      }

      // Re-normalize the existing normalized_data (not raw — we don't store raw now)
      const existing = JSON.parse(row.normalized_data) as NormalizedCustomFormat

      // Re-compute conditions hash with current algorithm
      const newHash = existing.conditions ? hashConditions(existing.conditions) : ''

      const reMigrated: NormalizedCustomFormat = {
        ...existing,
        conditionsHash: newHash,
        schemaVersion: PARSER_SCHEMA_VERSION,
      }

      db.prepare(`
        UPDATE trash_guides_cache
        SET normalized_data = ?, conditions_hash = ?, schema_version = ?
        WHERE id = ?
      `).run(JSON.stringify(reMigrated), newHash, PARSER_SCHEMA_VERSION, row.id)

      migrated++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[trash:migration] Failed to migrate cache row ${row.id} (${row.slug}): ${msg}`)
    }
  }

  return migrated
}
