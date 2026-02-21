import type { FastifyInstance } from 'fastify';
import { resolveCompanyWithSuggestions } from '../../core/resolver.js';
import { fetchInsiderActivity } from '../../processing/insider-processor.js';
import { getCompanySubmissions, searchFilings } from '../../core/sec-client.js';
import { serializeInsiderResult } from '../serialization.js';

export function registerCompanyRoutes(server: FastifyInstance) {
  server.get('/api/insider', async (request, reply) => {
    const { company, days } = request.query as Record<string, string>;

    if (!company) {
      return reply.status(400).send({ error: { type: 'validation', message: 'company is required' } });
    }

    const resolved = await resolveCompanyWithSuggestions(company);
    if (!resolved.company) {
      const status = resolved.suggestions.length > 0 ? 400 : 404;
      return reply.status(status).send({
        error: {
          type: resolved.suggestions.length > 0 ? 'company_ambiguous' : 'company_not_found',
          message: `Could not find company: "${company}"`,
          suggestions: resolved.suggestions,
        },
      });
    }

    const result = await fetchInsiderActivity(resolved.company, { days: days ? parseInt(days) : undefined });
    return reply.send(serializeInsiderResult(result));
  });

  server.get('/api/filings', async (request, reply) => {
    const { company, form, limit } = request.query as Record<string, string>;

    if (!company) {
      return reply.status(400).send({ error: { type: 'validation', message: 'company is required' } });
    }

    const resolved = await resolveCompanyWithSuggestions(company);
    if (!resolved.company) {
      const status = resolved.suggestions.length > 0 ? 400 : 404;
      return reply.status(status).send({
        error: {
          type: resolved.suggestions.length > 0 ? 'company_ambiguous' : 'company_not_found',
          message: `Could not find company: "${company}"`,
          suggestions: resolved.suggestions,
        },
      });
    }

    const submissions = await getCompanySubmissions(resolved.company.cik);
    const { recent } = submissions.filings;
    const maxFilings = limit ? parseInt(limit) : 20;
    const paddedCik = resolved.company.cik.padStart(10, '0');

    const filings: Array<{
      form_type: string; filing_date: string; description: string;
      accession_number: string; edgar_url: string;
    }> = [];

    for (let i = 0; i < recent.form.length && filings.length < maxFilings; i++) {
      if (form && !recent.form[i].startsWith(form.toUpperCase())) continue;
      const accNoDashes = recent.accessionNumber[i].replace(/-/g, '');
      filings.push({
        form_type: recent.form[i],
        filing_date: recent.filingDate[i],
        description: recent.primaryDocDescription[i] || recent.form[i],
        accession_number: recent.accessionNumber[i],
        edgar_url: `https://www.sec.gov/Archives/edgar/data/${paddedCik}/${accNoDashes}/${recent.primaryDocument[i]}`,
      });
    }

    return reply.send({
      company: { cik: resolved.company.cik, ticker: resolved.company.ticker, name: resolved.company.name },
      filings,
      total_available: recent.form.length,
    });
  });

  server.get('/api/info', async (request, reply) => {
    const { company } = request.query as Record<string, string>;

    if (!company) {
      return reply.status(400).send({ error: { type: 'validation', message: 'company is required' } });
    }

    const resolved = await resolveCompanyWithSuggestions(company);
    if (!resolved.company) {
      const status = resolved.suggestions.length > 0 ? 400 : 404;
      return reply.status(status).send({
        error: {
          type: resolved.suggestions.length > 0 ? 'company_ambiguous' : 'company_not_found',
          message: `Could not find company: "${company}"`,
          suggestions: resolved.suggestions,
        },
      });
    }

    const submissions = await getCompanySubmissions(resolved.company.cik);
    return reply.send({
      name: submissions.name,
      cik: resolved.company.cik,
      ticker: resolved.company.ticker,
      entity_type: submissions.entityType || null,
      sic: submissions.sic || null,
      sic_description: submissions.sicDescription || null,
      state_of_incorporation: submissions.stateOfIncorporation || null,
      fiscal_year_end: submissions.fiscalYearEnd || null,
      tickers: submissions.tickers || [],
      exchanges: submissions.exchanges || [],
      total_filings: submissions.filings.recent.form.length,
    });
  });

  server.get('/api/search', async (request, reply) => {
    const { query, forms, startDate, endDate, limit } = request.query as Record<string, string>;

    if (!query) {
      return reply.status(400).send({ error: { type: 'validation', message: 'query is required' } });
    }

    const result = await searchFilings({
      query,
      forms: forms ? forms.split(',').map(f => f.trim()) : undefined,
      startDate,
      endDate,
      limit: limit ? parseInt(limit) : undefined,
    });

    return reply.send({
      query,
      total_results: result.total,
      results: result.hits.map(h => ({
        company: h.display_name,
        cik: h.cik,
        form_type: h.form_type,
        filing_date: h.filing_date,
        period_ending: h.period_ending,
        accession_number: h.accession_number,
        location: h.location,
      })),
    });
  });
}
