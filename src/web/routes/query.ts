import type { FastifyInstance } from 'fastify';
import { executeQueryCore } from '../../core/query-engine.js';
import { errorToHttpStatus, serializeQueryResult, serializeTrendResult } from '../serialization.js';

export function registerQueryRoutes(server: FastifyInstance) {
  server.get('/api/query', async (request, reply) => {
    const { company, metric, years, periodType, quarters, targetYear } = request.query as Record<string, string>;

    if (!company || !metric) {
      return reply.status(400).send({ error: { type: 'validation', message: 'company and metric are required' } });
    }

    const result = await executeQueryCore({
      company,
      metric,
      years: years ? parseInt(years) : undefined,
      periodType: periodType as 'annual' | 'quarterly' | undefined,
      quarters: quarters ? parseInt(quarters) : undefined,
      targetYear: targetYear ? parseInt(targetYear) : undefined,
    });

    if (!result.success) {
      return reply.status(errorToHttpStatus(result.error!.type)).send({ error: result.error });
    }

    return reply.send(serializeQueryResult(result.result!));
  });

  server.get('/api/trend', async (request, reply) => {
    const { company, metric, years } = request.query as Record<string, string>;

    if (!company || !metric) {
      return reply.status(400).send({ error: { type: 'validation', message: 'company and metric are required' } });
    }

    const result = await executeQueryCore({
      company,
      metric,
      years: years ? parseInt(years) : 10,
    });

    if (!result.success) {
      return reply.status(errorToHttpStatus(result.error!.type)).send({ error: result.error });
    }

    return reply.send(serializeTrendResult(result.result!));
  });
}
