import type { FastifyInstance } from 'fastify';
import { executeCompareCore, executeCompareRatioCore } from '../../core/query-engine.js';
import { errorToHttpStatus, serializeCompareResult, serializeCompareRatioResult } from '../serialization.js';

export function registerCompareRoutes(server: FastifyInstance) {
  server.get('/api/compare', async (request, reply) => {
    const { tickers, metric, years } = request.query as Record<string, string>;

    if (!tickers || !metric) {
      return reply.status(400).send({ error: { type: 'validation', message: 'tickers (comma-separated) and metric are required' } });
    }

    const tickerList = tickers.split(',').map(t => t.trim()).filter(Boolean);
    if (tickerList.length < 2) {
      return reply.status(400).send({ error: { type: 'validation', message: 'At least 2 tickers are required' } });
    }

    const { results, errors } = await executeCompareCore({
      tickers: tickerList,
      metric,
      years: years ? parseInt(years) : undefined,
    });

    if (results.length === 0 && errors.length > 0) {
      return reply.status(404).send({ error: { type: 'no_data', message: 'No data found', details: errors } });
    }

    return reply.send(serializeCompareResult(results, errors));
  });

  server.get('/api/compare-ratio', async (request, reply) => {
    const { tickers, ratio, years } = request.query as Record<string, string>;

    if (!tickers || !ratio) {
      return reply.status(400).send({ error: { type: 'validation', message: 'tickers (comma-separated) and ratio are required' } });
    }

    const tickerList = tickers.split(',').map(t => t.trim()).filter(Boolean);
    if (tickerList.length < 2) {
      return reply.status(400).send({ error: { type: 'validation', message: 'At least 2 tickers are required' } });
    }

    const { results, errors } = await executeCompareRatioCore({
      tickers: tickerList,
      ratio,
      years: years ? parseInt(years) : undefined,
    });

    if (results.length === 0 && errors.length > 0) {
      return reply.status(404).send({ error: { type: 'no_data', message: 'No data found', details: errors } });
    }

    return reply.send(serializeCompareRatioResult(results, errors));
  });
}
