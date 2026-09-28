const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
function openDatabase(filename = process.env.DATABASE_PATH || path.join(__dirname, 'storage', 'careermatch.db')) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, recovery TEXT NOT NULL, profile TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS opportunities(id TEXT PRIMARY KEY, source TEXT NOT NULL, source_id TEXT NOT NULL, url TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, seen_at TEXT NOT NULL, UNIQUE(source, source_id));
    CREATE TABLE IF NOT EXISTS saved(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, opportunity_id TEXT NOT NULL REFERENCES opportunities(id), created_at TEXT NOT NULL, PRIMARY KEY(user_id, opportunity_id));
    CREATE TABLE IF NOT EXISTS applications(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, opportunity_id TEXT NOT NULL REFERENCES opportunities(id), status TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, PRIMARY KEY(user_id, opportunity_id));
    CREATE TABLE IF NOT EXISTS feed_runs(source TEXT PRIMARY KEY, attempted_at TEXT, succeeded_at TEXT, count INTEGER NOT NULL DEFAULT 0, error TEXT);
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
    CREATE INDEX IF NOT EXISTS opportunity_active ON opportunities(active, source);
    PRAGMA user_version=1;`);
  return db;
}
const now = () => new Date().toISOString();
function catalog(db) {
  return db.prepare('SELECT payload, active, seen_at FROM opportunities WHERE active=1').all().map(row => ({...JSON.parse(row.payload), lastSeen:row.seen_at})).filter(o => !o.deadline || o.deadline >= now().slice(0,10));
}
function upsert(db, o) {
  db.prepare(`INSERT INTO opportunities(id,source,source_id,url,payload,seen_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(source,source_id) DO UPDATE SET url=excluded.url,payload=excluded.payload,active=1,seen_at=excluded.seen_at`).run(o.id,o.source,o.sourceId,o.url,JSON.stringify(o),now());
}
module.exports = { openDatabase, catalog, upsert, now };
