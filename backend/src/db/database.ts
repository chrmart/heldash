import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let db!: Database.Database

export function getDb(): Database.Database {
  return db
}

export function initDb(dataDir: string): Database.Database {
  const dbDir = path.join(dataDir, 'db')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = path.join(dbDir, 'heldash.db')
  db = new Database(dbPath)

  // Performance settings
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')

  applySchema(db)
  runMigrations(db)
  return db
}

function runMigrations(db: Database.Database) {
  // Add icon_url column to existing databases (safe to run multiple times)
  try {
    db.exec('ALTER TABLE services ADD COLUMN icon_url TEXT')
  } catch {
    // Column already exists – ignore
  }
}

function applySchema(db: Database.Database) {
  db.exec(`
    -- Dashboard groups / categories
    CREATE TABLE IF NOT EXISTS groups (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      icon        TEXT,
      position    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Service tiles
    CREATE TABLE IF NOT EXISTS services (
      id            TEXT PRIMARY KEY,
      group_id      TEXT REFERENCES groups(id) ON DELETE SET NULL,
      name          TEXT NOT NULL,
      url           TEXT NOT NULL,
      icon          TEXT,
      description   TEXT,
      tags          TEXT DEFAULT '[]',  -- JSON array
      position_x    INTEGER NOT NULL DEFAULT 0,
      position_y    INTEGER NOT NULL DEFAULT 0,
      width         INTEGER NOT NULL DEFAULT 1,
      height        INTEGER NOT NULL DEFAULT 1,
      check_enabled INTEGER NOT NULL DEFAULT 1,
      check_url     TEXT,               -- Override URL for health check
      check_interval INTEGER NOT NULL DEFAULT 60,  -- seconds
      last_status   TEXT,               -- online | offline | unknown
      last_checked  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Dashboard settings (key-value store)
    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Future: Users table (prepared but not active)
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role          TEXT NOT NULL DEFAULT 'user',
      oidc_subject  TEXT,
      oidc_provider TEXT,
      last_login    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Insert default settings if not exist
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('theme_mode', '"dark"'),
      ('theme_accent', '"cyan"'),
      ('dashboard_title', '"HELDASH"'),
      ('auth_enabled', 'false'),
      ('auth_mode', '"none"');
  `)
}
