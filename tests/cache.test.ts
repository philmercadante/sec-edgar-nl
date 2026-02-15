import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Cache system tests.
 *
 * The cache module uses module-level state (singleton DB, in-memory map)
 * so we test the core logic patterns directly with a temp DB rather than
 * importing the module (which would interfere with the real cache).
 */

// Replicate the core cache logic for testing
function hashUrl(url: string): string {
  const { createHash } = require('node:crypto');
  return createHash('sha256').update(url).digest('hex');
}

describe('Cache', () => {
  let db: Database.Database;
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `sec-edgar-nl-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    db = new Database(join(tempDir, 'test-cache.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 3000');
    db.exec(`
      CREATE TABLE IF NOT EXISTS http_cache (
        url_hash TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        response_body TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        metric_id TEXT NOT NULL,
        last_value REAL,
        last_fiscal_year INTEGER,
        last_period_end TEXT,
        last_checked TEXT,
        added_at TEXT NOT NULL,
        UNIQUE(ticker, metric_id)
      )
    `);
  });

  afterEach(() => {
    db.close();
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('HTTP cache', () => {
    it('stores and retrieves cached responses', () => {
      const url = 'https://data.sec.gov/api/test/data.json';
      const hash = hashUrl(url);
      const body = '{"test": true}';
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      db.prepare(`
        INSERT INTO http_cache (url_hash, url, response_body, fetched_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(hash, url, body, now.toISOString(), expiresAt.toISOString());

      const row = db.prepare(
        'SELECT response_body FROM http_cache WHERE url_hash = ? AND expires_at > ?'
      ).get(hash, now.toISOString()) as { response_body: string } | undefined;

      expect(row).toBeDefined();
      expect(row!.response_body).toBe(body);
    });

    it('returns null for expired cache entries', () => {
      const url = 'https://data.sec.gov/api/test/expired.json';
      const hash = hashUrl(url);
      const body = '{"expired": true}';
      const past = new Date(Date.now() - 1000);
      const expiredAt = new Date(Date.now() - 500);

      db.prepare(`
        INSERT INTO http_cache (url_hash, url, response_body, fetched_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(hash, url, body, past.toISOString(), expiredAt.toISOString());

      const row = db.prepare(
        'SELECT response_body FROM http_cache WHERE url_hash = ? AND expires_at > ?'
      ).get(hash, new Date().toISOString()) as { response_body: string } | undefined;

      expect(row).toBeUndefined();
    });

    it('overwrites existing entries on INSERT OR REPLACE', () => {
      const url = 'https://data.sec.gov/api/test/overwrite.json';
      const hash = hashUrl(url);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      db.prepare(`
        INSERT INTO http_cache (url_hash, url, response_body, fetched_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(hash, url, '{"version": 1}', now.toISOString(), expiresAt.toISOString());

      db.prepare(`
        INSERT OR REPLACE INTO http_cache (url_hash, url, response_body, fetched_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(hash, url, '{"version": 2}', now.toISOString(), expiresAt.toISOString());

      const row = db.prepare(
        'SELECT response_body FROM http_cache WHERE url_hash = ?'
      ).get(hash) as { response_body: string };

      expect(row.response_body).toBe('{"version": 2}');
    });

    it('clears all cache entries', () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      for (let i = 0; i < 5; i++) {
        const url = `https://data.sec.gov/api/test/${i}.json`;
        db.prepare(`
          INSERT INTO http_cache (url_hash, url, response_body, fetched_at, expires_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(hashUrl(url), url, `{"i": ${i}}`, now.toISOString(), expiresAt.toISOString());
      }

      const countBefore = (db.prepare('SELECT COUNT(*) as count FROM http_cache').get() as { count: number }).count;
      expect(countBefore).toBe(5);

      db.exec('DELETE FROM http_cache');

      const countAfter = (db.prepare('SELECT COUNT(*) as count FROM http_cache').get() as { count: number }).count;
      expect(countAfter).toBe(0);
    });

    it('reports cache stats correctly', () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const body = 'x'.repeat(1000);

      for (let i = 0; i < 3; i++) {
        const url = `https://data.sec.gov/api/test/stats-${i}.json`;
        db.prepare(`
          INSERT INTO http_cache (url_hash, url, response_body, fetched_at, expires_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(hashUrl(url), url, body, now.toISOString(), expiresAt.toISOString());
      }

      const row = db.prepare(
        'SELECT COUNT(*) as count, COALESCE(SUM(LENGTH(response_body)), 0) as size FROM http_cache'
      ).get() as { count: number; size: number };

      expect(row.count).toBe(3);
      expect(row.size).toBe(3000);
    });
  });

  describe('In-memory FIFO cache', () => {
    it('evicts oldest entry when capacity exceeded', () => {
      const memCache = new Map<string, { body: string; expiresAt: number }>();
      const MAX = 3;

      function setMemCache(hash: string, body: string, expiresAt: number): void {
        if (memCache.size >= MAX) {
          const firstKey = memCache.keys().next().value;
          if (firstKey) memCache.delete(firstKey);
        }
        memCache.set(hash, { body, expiresAt });
      }

      setMemCache('a', 'body-a', Date.now() + 10000);
      setMemCache('b', 'body-b', Date.now() + 10000);
      setMemCache('c', 'body-c', Date.now() + 10000);

      expect(memCache.size).toBe(3);
      expect(memCache.has('a')).toBe(true);

      // This should evict 'a' (FIFO)
      setMemCache('d', 'body-d', Date.now() + 10000);

      expect(memCache.size).toBe(3);
      expect(memCache.has('a')).toBe(false);
      expect(memCache.has('d')).toBe(true);
    });

    it('skips expired in-memory entries', () => {
      const memCache = new Map<string, { body: string; expiresAt: number }>();
      const now = Date.now();

      memCache.set('valid', { body: 'fresh', expiresAt: now + 10000 });
      memCache.set('expired', { body: 'stale', expiresAt: now - 1000 });

      const valid = memCache.get('valid');
      expect(valid && valid.expiresAt > now ? valid.body : null).toBe('fresh');

      const expired = memCache.get('expired');
      expect(expired && expired.expiresAt > now ? expired.body : null).toBeNull();
    });
  });

  describe('Watchlist', () => {
    it('adds items to watchlist', () => {
      db.prepare(`
        INSERT OR IGNORE INTO watchlist (ticker, metric_id, added_at)
        VALUES (?, ?, ?)
      `).run('AAPL', 'revenue', new Date().toISOString());

      const items = db.prepare('SELECT * FROM watchlist').all() as Array<{ ticker: string; metric_id: string }>;
      expect(items).toHaveLength(1);
      expect(items[0].ticker).toBe('AAPL');
      expect(items[0].metric_id).toBe('revenue');
    });

    it('ignores duplicate watchlist entries', () => {
      const now = new Date().toISOString();
      db.prepare('INSERT OR IGNORE INTO watchlist (ticker, metric_id, added_at) VALUES (?, ?, ?)').run('AAPL', 'revenue', now);
      db.prepare('INSERT OR IGNORE INTO watchlist (ticker, metric_id, added_at) VALUES (?, ?, ?)').run('AAPL', 'revenue', now);

      const items = db.prepare('SELECT * FROM watchlist').all();
      expect(items).toHaveLength(1);
    });

    it('removes watchlist entries', () => {
      const now = new Date().toISOString();
      db.prepare('INSERT OR IGNORE INTO watchlist (ticker, metric_id, added_at) VALUES (?, ?, ?)').run('AAPL', 'revenue', now);
      db.prepare('INSERT OR IGNORE INTO watchlist (ticker, metric_id, added_at) VALUES (?, ?, ?)').run('MSFT', 'net_income', now);

      const result = db.prepare('DELETE FROM watchlist WHERE ticker = ? AND metric_id = ?').run('AAPL', 'revenue');
      expect(result.changes).toBe(1);

      const remaining = db.prepare('SELECT * FROM watchlist').all() as Array<{ ticker: string }>;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].ticker).toBe('MSFT');
    });

    it('updates watchlist entry values', () => {
      const now = new Date().toISOString();
      db.prepare('INSERT OR IGNORE INTO watchlist (ticker, metric_id, added_at) VALUES (?, ?, ?)').run('AAPL', 'revenue', now);

      db.prepare(`
        UPDATE watchlist SET last_value = ?, last_fiscal_year = ?, last_period_end = ?, last_checked = ?
        WHERE ticker = ? AND metric_id = ?
      `).run(383290000000, 2023, '2023-09-30', now, 'AAPL', 'revenue');

      const item = db.prepare('SELECT * FROM watchlist WHERE ticker = ? AND metric_id = ?').get('AAPL', 'revenue') as {
        last_value: number; last_fiscal_year: number; last_period_end: string;
      };

      expect(item.last_value).toBe(383290000000);
      expect(item.last_fiscal_year).toBe(2023);
      expect(item.last_period_end).toBe('2023-09-30');
    });

    it('clears all watchlist entries', () => {
      const now = new Date().toISOString();
      db.prepare('INSERT OR IGNORE INTO watchlist (ticker, metric_id, added_at) VALUES (?, ?, ?)').run('AAPL', 'revenue', now);
      db.prepare('INSERT OR IGNORE INTO watchlist (ticker, metric_id, added_at) VALUES (?, ?, ?)').run('MSFT', 'net_income', now);

      db.exec('DELETE FROM watchlist');

      const items = db.prepare('SELECT * FROM watchlist').all();
      expect(items).toHaveLength(0);
    });
  });

  describe('URL hashing', () => {
    it('produces consistent hashes', () => {
      const url = 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json';
      expect(hashUrl(url)).toBe(hashUrl(url));
    });

    it('produces different hashes for different URLs', () => {
      const hash1 = hashUrl('https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json');
      const hash2 = hashUrl('https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json');
      expect(hash1).not.toBe(hash2);
    });
  });
});
