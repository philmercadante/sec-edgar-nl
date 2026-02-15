import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, unlinkSync } from 'node:fs';

/**
 * SQLite cache for SEC EDGAR API responses.
 * Caches at the HTTP response level to avoid redundant API calls.
 *
 * Resilient to corruption: if the DB can't be opened, it's deleted
 * and recreated. Cache is non-critical — losing it just means
 * re-fetching from SEC.
 */

const CACHE_DIR = join(homedir(), '.sec-edgar-nl');
const CACHE_DB = join(CACHE_DIR, 'cache.db');

let db: Database.Database | null = null;

/** In-memory LRU for hot-path cache hits within a session */
const memCache = new Map<string, { body: string; expiresAt: number }>();
const MEM_CACHE_MAX = 100;

function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(CACHE_DIR, { recursive: true });

  try {
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
  } catch {
    // DB corrupted — delete and recreate
    try { unlinkSync(CACHE_DB); } catch { /* ignore */ }
    try { unlinkSync(CACHE_DB + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(CACHE_DB + '-shm'); } catch { /* ignore */ }

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
  }

  return db;
}

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

/** Get cached response if still valid */
export function getCached(url: string): string | null {
  const hash = hashUrl(url);
  const now = Date.now();

  // Check in-memory cache first
  const mem = memCache.get(hash);
  if (mem && mem.expiresAt > now) return mem.body;

  const d = getDb();
  const row = d.prepare(
    'SELECT response_body, expires_at FROM http_cache WHERE url_hash = ? AND expires_at > ?'
  ).get(hash, new Date().toISOString()) as { response_body: string; expires_at: string } | undefined;

  if (row) {
    // Promote to in-memory cache
    setMemCache(hash, row.response_body, new Date(row.expires_at).getTime());
    return row.response_body;
  }

  return null;
}

/** Store response in cache */
export function setCache(url: string, body: string, ttlHours: number = 24): void {
  const hash = hashUrl(url);
  const now = new Date();
  const expiresAt = now.getTime() + ttlHours * 60 * 60 * 1000;
  const expiresIso = new Date(expiresAt).toISOString();

  // In-memory cache
  setMemCache(hash, body, expiresAt);

  // SQLite cache
  const d = getDb();
  d.prepare(`
    INSERT OR REPLACE INTO http_cache (url_hash, url, response_body, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(hash, url, body, now.toISOString(), expiresIso);
}

function setMemCache(hash: string, body: string, expiresAt: number): void {
  if (memCache.size >= MEM_CACHE_MAX) {
    // Evict oldest entry
    const firstKey = memCache.keys().next().value;
    if (firstKey) memCache.delete(firstKey);
  }
  memCache.set(hash, { body, expiresAt });
}

/** Close the database connection */
export function closeCache(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** Clear all cached data */
export function clearCache(): void {
  memCache.clear();
  const d = getDb();
  d.exec('DELETE FROM http_cache');
}

/** Get cache stats for diagnostics */
export function getCacheStats(): { entries: number; sizeBytes: number } {
  const d = getDb();
  const row = d.prepare(
    'SELECT COUNT(*) as count, COALESCE(SUM(LENGTH(response_body)), 0) as size FROM http_cache'
  ).get() as { count: number; size: number };
  return { entries: row.count, sizeBytes: row.size };
}
