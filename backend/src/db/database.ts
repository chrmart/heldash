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
  const migrations: string[] = [
    'ALTER TABLE services ADD COLUMN icon_url TEXT',
    'ALTER TABLE users ADD COLUMN email TEXT',
    'ALTER TABLE users ADD COLUMN first_name TEXT',
    'ALTER TABLE users ADD COLUMN last_name TEXT',
    'ALTER TABLE users ADD COLUMN user_group_id TEXT',  // FK not enforceable via ALTER TABLE in SQLite
    'ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime(\'now\'))',
  ]
  for (const sql of migrations) {
    try {
      db.exec(sql)
    } catch {
      // Column already exists – ignore
    }
  }

  // Ensure default system user groups exist
  db.prepare(`
    INSERT OR IGNORE INTO user_groups (id, name, description, is_system)
    VALUES ('grp_admin', 'Admin', 'Full unrestricted access', 1)
  `).run()
  db.prepare(`
    INSERT OR IGNORE INTO user_groups (id, name, description, is_system)
    VALUES ('grp_guest', 'Guest', 'Read-only access', 1)
  `).run()
}

function applySchema(db: Database.Database) {
  db.exec(`
    -- App groups / categories
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

    -- User groups for access control (separate from app groups)
    CREATE TABLE IF NOT EXISTS user_groups (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      is_system   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role          TEXT NOT NULL DEFAULT 'user',
      email         TEXT,
      first_name    TEXT,
      last_name     TEXT,
      user_group_id TEXT REFERENCES user_groups(id) ON DELETE SET NULL,
      is_active     INTEGER NOT NULL DEFAULT 1,
      oidc_subject  TEXT,
      oidc_provider TEXT,
      last_login    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Insert default settings if not exist
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('theme_mode', '"dark"'),
      ('theme_accent', '"cyan"'),
      ('dashboard_title', '"HELDASH"'),
      ('auth_enabled', 'true'),
      ('auth_mode', '"local"');
  `)
}
