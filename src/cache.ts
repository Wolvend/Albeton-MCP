import fs from "node:fs/promises";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";
import { LOCAL_PATHS } from "./config.js";

let SQL: SqlJsStatic | undefined;
let db: Database | undefined;
const dbPath = path.join(LOCAL_PATHS.projectRoot, "data", "cache", "ableton-mcp.sqlite");

export async function getDb() {
  if (db) return db;
  SQL ??= await initSqlJs();
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  try {
    const data = await fs.readFile(dbPath);
    db = new SQL.Database(data);
  } catch {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS library_items (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime_ms INTEGER NOT NULL,
      indexed_at TEXT NOT NULL,
      metadata TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_library_kind ON library_items(kind);
    CREATE TABLE IF NOT EXISTS remote_samples (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      license TEXT,
      source_url TEXT,
      metadata TEXT NOT NULL,
      cached_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bridge_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sample_intelligence (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      display_path TEXT NOT NULL,
      source_pack TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      extension TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime_ms INTEGER NOT NULL,
      duration_seconds REAL,
      sample_rate INTEGER,
      channels INTEGER,
      peak_db REAL,
      loudness_hint TEXT,
      tags TEXT NOT NULL,
      roles TEXT NOT NULL,
      attribution_state TEXT NOT NULL,
      metadata TEXT NOT NULL,
      indexed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sample_intelligence_name ON sample_intelligence(name);
    CREATE INDEX IF NOT EXISTS idx_sample_intelligence_pack ON sample_intelligence(source_pack);
    CREATE INDEX IF NOT EXISTS idx_sample_intelligence_kind ON sample_intelligence(kind);
  `);
  return db;
}

export async function persistDb() {
  if (!db) return;
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, Buffer.from(db.export()));
}

export async function upsertLibraryItems(items: Array<Record<string, unknown>>) {
  const database = await getDb();
  database.run("BEGIN TRANSACTION");
  const stmt = database.prepare("INSERT OR REPLACE INTO library_items (id,path,name,kind,size,mtime_ms,indexed_at,metadata) VALUES (?,?,?,?,?,?,?,?)");
  for (const item of items) {
    const values: SqlValue[] = [
      String(item.id),
      String(item.path),
      String(item.name),
      String(item.kind),
      Number(item.size),
      Number(item.mtimeMs),
      String(item.indexedAt),
      JSON.stringify(item.metadata ?? {})
    ];
    stmt.run(values);
  }
  stmt.free();
  database.run("COMMIT");
  await persistDb();
}

export async function queryLibrary(query = "", kind?: string) {
  const database = await getDb();
  const rows: any[] = [];
  if (query.trim()) {
    const stmt = database.prepare("SELECT * FROM library_items WHERE lower(name) LIKE ? OR lower(path) LIKE ? OR lower(kind) LIKE ? OR lower(metadata) LIKE ? ORDER BY mtime_ms DESC LIMIT 500");
    const needle = `%${query.toLowerCase().replace(/[%_]/g, "")}%`;
    stmt.bind([needle, needle, needle, needle]);
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
  } else {
    const stmt = kind
      ? database.prepare("SELECT * FROM library_items WHERE kind=? ORDER BY mtime_ms DESC LIMIT 500")
      : database.prepare("SELECT * FROM library_items ORDER BY mtime_ms DESC LIMIT 500");
    if (kind) stmt.bind([kind]);
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
  }
  return rows.filter((row) => !kind || row.kind === kind).map((row) => ({ ...row, metadata: JSON.parse(String(row.metadata ?? "{}")) }));
}
