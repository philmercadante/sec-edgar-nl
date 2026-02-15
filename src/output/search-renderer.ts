import { csvEscape } from './format-utils.js';
import type { SearchResult } from '../core/sec-client.js';

/**
 * Render search results as CSV.
 */
export function renderSearchCsv(result: SearchResult): string {
  const lines: string[] = [];
  lines.push('company,cik,form_type,filing_date,period_ending,accession_number,location');

  for (const h of result.hits) {
    lines.push([
      csvEscape(h.display_name),
      h.cik,
      h.form_type,
      h.filing_date,
      h.period_ending,
      h.accession_number,
      csvEscape(h.location),
    ].join(','));
  }

  return lines.join('\n');
}
