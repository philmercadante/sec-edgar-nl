import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';

/**
 * SQLite cache for SEC EDGAR API responses.
 * Caches at the HTTP response level to avoid redundant API calls.
 */

const CACHE_DIR = join(homedir(), '.sec-edgar-nl');
const CACHE_DB = join(CACHE_DIR, 'cache.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(CACHE_DIR, { recursive: true });
  db = new Database(CACHE_DB);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS http_cache (
      url_hash TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      response_body TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);

  return db;
}

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

/** Get cached response if still valid */
export function getCached(url: string): string | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT response_body FROM http_cache WHERE url_hash = ? AND expires_at > ?'
  ).get(hashUrl(url), new Date().toISOString()) as { response_body: string } | undefined;

  return row?.response_body ?? null;
}

/** Store response in cache */
export function setCache(url: string, body: string, ttlHours: number = 24): void {
  const db = getDb();
  const now = new Date();
  const expires = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  db.prepare(`
    INSERT OR REPLACE INTO http_cache (url_hash, url, response_body, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(hashUrl(url), url, body, now.toISOString(), expires.toISOString());
}

/** Close the database connection */
export function closeCache(): void {
  if (db) {
    db.close();
    db = null;
  }
}
