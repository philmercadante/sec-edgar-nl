#!/usr/bin/env node

/**
 * Web UI server for sec-edgar-nl.
 * Serves the REST API and static frontend on a configurable port.
 *
 * Usage:
 *   npm run web                  # Start on default port 3005
 *   PORT=8080 npm run web        # Custom port
 *   sec-edgar-nl-web             # If globally linked
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { registerQueryRoutes } from './routes/query.js';
import { registerCompareRoutes } from './routes/compare.js';
import { registerSummaryRoutes } from './routes/summary.js';
import { registerScreenRoutes } from './routes/screen.js';
import { registerCompanyRoutes } from './routes/company.js';
import { registerMetaRoutes } from './routes/meta.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const server = Fastify({ logger: false });

// Serve static frontend from public/
// In dev (tsx): src/web/server.ts → ../../public
// In dist: dist/web/server.js → ../../public
const publicDir = join(__dirname, '..', '..', 'public');
await server.register(fastifyStatic, { root: publicDir, prefix: '/' });

// Register API routes
registerQueryRoutes(server);
registerCompareRoutes(server);
registerSummaryRoutes(server);
registerScreenRoutes(server);
registerCompanyRoutes(server);
registerMetaRoutes(server);

// Global error handler
server.setErrorHandler((error: Error, _request, reply) => {
  console.error('Server error:', error.message);
  reply.status(500).send({ error: { type: 'internal', message: 'Internal server error' } });
});

const port = parseInt(process.env.PORT || '3005', 10);
await server.listen({ port, host: '0.0.0.0' });

console.log(`
  sec-edgar-nl web UI
  http://localhost:${port}

  API: http://localhost:${port}/api/metrics
  Press Ctrl+C to stop
`);
