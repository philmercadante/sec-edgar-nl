import type { FastifyInstance } from 'fastify';
import { METRIC_DEFINITIONS } from '../../processing/metric-definitions.js';
import { RATIO_DEFINITIONS } from '../../processing/ratio-definitions.js';
import { getCacheStats } from '../../core/cache.js';

export function registerMetaRoutes(server: FastifyInstance) {
  server.get('/api/metrics', async () => {
    return {
      metrics: METRIC_DEFINITIONS.map(m => ({
        id: m.id,
        display_name: m.display_name,
        description: m.description,
        statement_type: m.statement_type,
        unit_type: m.unit_type,
      })),
    };
  });

  server.get('/api/ratios', async () => {
    return {
      ratios: RATIO_DEFINITIONS.map(r => ({
        id: r.id,
        display_name: r.display_name,
        description: r.description,
        numerator: r.numerator,
        denominator: r.denominator,
        operation: r.operation || 'divide',
        format: r.format,
      })),
    };
  });

  server.get('/api/cache-stats', async () => {
    try {
      const stats = getCacheStats();
      return {
        entries: stats.entries,
        size_bytes: stats.sizeBytes,
        size_mb: (stats.sizeBytes / 1024 / 1024).toFixed(1),
      };
    } catch {
      return { entries: 0, size_bytes: 0, size_mb: '0.0' };
    }
  });
}
