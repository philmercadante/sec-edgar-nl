import type { FastifyInstance } from 'fastify';
import { executeScreenCore } from '../../core/query-engine.js';
import { errorToHttpStatus, serializeScreenResult } from '../serialization.js';
import { executeRatioCore } from '../../core/query-engine.js';
import { serializeRatioResult } from '../serialization.js';

export function registerScreenRoutes(server: FastifyInstance) {
  server.get('/api/screen', async (request, reply) => {
    const { metric, year, min, max, sortBy, limit } = request.query as Record<string, string>;

    if (!metric) {
      return reply.status(400).send({ error: { type: 'validation', message: 'metric is required' } });
    }

    const result = await executeScreenCore({
      metric,
      year: year ? parseInt(year) : undefined,
      minValue: min ? parseFloat(min) : undefined,
      maxValue: max ? parseFloat(max) : undefined,
      sortBy: (sortBy as 'value_desc' | 'value_asc' | 'name') || undefined,
      limit: limit ? parseInt(limit) : undefined,
    });

    if (!result.success) {
      return reply.status(errorToHttpStatus(result.error!.type)).send({ error: result.error });
    }

    return reply.send(serializeScreenResult(result.result!));
  });

  server.get('/api/ratio', async (request, reply) => {
    const { company, ratio, years } = request.query as Record<string, string>;

    if (!company || !ratio) {
      return reply.status(400).send({ error: { type: 'validation', message: 'company and ratio are required' } });
    }

    const result = await executeRatioCore({
      company,
      ratio,
      years: years ? parseInt(years) : undefined,
    });

    if (!result.success) {
      return reply.status(errorToHttpStatus(result.error!.type)).send({ error: result.error });
    }

    return reply.send(serializeRatioResult(result.result!));
  });
}
