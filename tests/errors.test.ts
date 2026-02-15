import { describe, it, expect } from 'vitest';
import {
  SecApiError,
  NotFoundError,
  RateLimitError,
  DataParseError,
  CompanyNotFoundError,
  MetricNotFoundError,
} from '../src/core/errors.js';

describe('Custom Error Types', () => {
  it('SecApiError has statusCode and url', () => {
    const err = new SecApiError('test', 500, 'https://example.com');
    expect(err.statusCode).toBe(500);
    expect(err.url).toBe('https://example.com');
    expect(err.name).toBe('SecApiError');
    expect(err instanceof Error).toBe(true);
  });

  it('NotFoundError is a 404 SecApiError', () => {
    const err = new NotFoundError('https://example.com');
    expect(err.statusCode).toBe(404);
    expect(err instanceof SecApiError).toBe(true);
  });

  it('RateLimitError is a 429 SecApiError', () => {
    const err = new RateLimitError('https://example.com');
    expect(err.statusCode).toBe(429);
    expect(err instanceof SecApiError).toBe(true);
  });

  it('DataParseError has source', () => {
    const err = new DataParseError('bad json', 'https://example.com');
    expect(err.source).toBe('https://example.com');
    expect(err.name).toBe('DataParseError');
  });

  it('CompanyNotFoundError shows suggestions', () => {
    const err = new CompanyNotFoundError('app', ['AAPL', 'APP']);
    expect(err.message).toContain('Did you mean');
    expect(err.suggestions).toEqual(['AAPL', 'APP']);
  });

  it('CompanyNotFoundError without suggestions', () => {
    const err = new CompanyNotFoundError('xyzzy');
    expect(err.message).toContain('Try using a ticker symbol');
  });

  it('MetricNotFoundError has available metrics', () => {
    const err = new MetricNotFoundError('employees', ['revenue', 'net_income']);
    expect(err.availableMetrics).toEqual(['revenue', 'net_income']);
  });
});
