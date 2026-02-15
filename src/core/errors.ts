/**
 * Custom error types for SEC EDGAR API interactions.
 * Enables callers to handle different failure modes appropriately.
 */

export class SecApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly url: string
  ) {
    super(message);
    this.name = 'SecApiError';
  }
}

export class NotFoundError extends SecApiError {
  constructor(url: string, detail: string = '') {
    super(
      `Not found: ${detail || url}`,
      404,
      url
    );
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends SecApiError {
  constructor(url: string) {
    super(
      'SEC API rate limit exceeded. The tool respects SEC fair access policy (10 req/s). Please wait a moment and retry.',
      429,
      url
    );
    this.name = 'RateLimitError';
  }
}

export class DataParseError extends Error {
  constructor(message: string, public readonly source: string) {
    super(message);
    this.name = 'DataParseError';
  }
}

export class CompanyNotFoundError extends Error {
  constructor(
    public readonly query: string,
    public readonly suggestions: string[] = []
  ) {
    const msg = suggestions.length > 0
      ? `Could not find company: "${query}". Did you mean: ${suggestions.join(', ')}?`
      : `Could not find company: "${query}". Try using a ticker symbol (e.g., AAPL).`;
    super(msg);
    this.name = 'CompanyNotFoundError';
  }
}

export class MetricNotFoundError extends Error {
  constructor(
    public readonly query: string,
    public readonly availableMetrics: string[]
  ) {
    super(`Could not identify a metric in: "${query}"`);
    this.name = 'MetricNotFoundError';
  }
}
