import type { FastifyInstance } from 'fastify';
import { executeSummaryCore, executeMultiMetricCore, executeMatrixCore } from '../../core/query-engine.js';
import { errorToHttpStatus, serializeSummaryResult, serializeMultiMetricResult, serializeMatrixResult } from '../serialization.js';

export function registerSummaryRoutes(server: FastifyInstance) {
  server.get('/api/summary', async (request, reply) => {
    const { company, year, years } = request.query as Record<string, string>;

    if (!company) {
      return reply.status(400).send({ error: { type: 'validation', message: 'company is required' } });
    }

    const result = await executeSummaryCore({
      company,
      year: year ? parseInt(year) : undefined,
      years: years ? parseInt(years) : undefined,
    });

    if (!result.success) {
      return reply.status(errorToHttpStatus(result.error!.type)).send({ error: result.error });
    }

    return reply.send(serializeSummaryResult(result.result!));
  });

  server.get('/api/multi-metric', async (request, reply) => {
    const { company, metrics, years } = request.query as Record<string, string>;

    if (!company || !metrics) {
      return reply.status(400).send({ error: { type: 'validation', message: 'company and metrics (comma-separated) are required' } });
    }

    const metricList = metrics.split(',').map(m => m.trim()).filter(Boolean);
    if (metricList.length < 2) {
      return reply.status(400).send({ error: { type: 'validation', message: 'At least 2 metrics are required' } });
    }

    const result = await executeMultiMetricCore({
      company,
      metrics: metricList,
      years: years ? parseInt(years) : undefined,
    });

    if (!result.success) {
      return reply.status(errorToHttpStatus(result.error!.type)).send({ error: result.error });
    }

    return reply.send(serializeMultiMetricResult(result.result!));
  });

  server.get('/api/matrix', async (request, reply) => {
    const { tickers, metrics, year } = request.query as Record<string, string>;

    if (!tickers || !metrics) {
      return reply.status(400).send({ error: { type: 'validation', message: 'tickers and metrics (both comma-separated) are required' } });
    }

    const tickerList = tickers.split(',').map(t => t.trim()).filter(Boolean);
    const metricList = metrics.split(',').map(m => m.trim()).filter(Boolean);

    if (tickerList.length < 2) {
      return reply.status(400).send({ error: { type: 'validation', message: 'At least 2 tickers are required' } });
    }

    const result = await executeMatrixCore({
      tickers: tickerList,
      metrics: metricList,
      year: year ? parseInt(year) : undefined,
    });

    if (!result.success) {
      return reply.status(errorToHttpStatus(result.error!.type)).send({ error: result.error });
    }

    return reply.send(serializeMatrixResult(result.result!, result.errors));
  });
}
