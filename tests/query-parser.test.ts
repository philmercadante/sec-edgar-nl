import { describe, it, expect } from 'vitest';
import { parseQuery } from '../src/analysis/query-parser.js';

describe('parseQuery', () => {
  describe('company extraction', () => {
    it('extracts ticker at start', () => {
      const result = parseQuery('AAPL revenue');
      expect(result.company).toBe('AAPL');
    });

    it('extracts possessive company name', () => {
      const result = parseQuery("Apple's R&D spending over the last 5 years");
      expect(result.company).toBe('Apple');
    });

    it('extracts company after "for"', () => {
      const result = parseQuery('revenue for Tesla');
      expect(result.company).toBe('Tesla');
    });

    it('handles curly quotes', () => {
      const result = parseQuery("\u2018Apple\u2019s revenue");
      expect(result.company).toBe('Apple');
    });
  });

  describe('metric extraction', () => {
    it('finds revenue', () => {
      const result = parseQuery('AAPL revenue');
      expect(result.metric?.id).toBe('revenue');
    });

    it('finds R&D', () => {
      const result = parseQuery('Apple R&D');
      expect(result.metric?.id).toBe('rd_expense');
    });

    it('finds "research and development"', () => {
      const result = parseQuery('MSFT research and development');
      expect(result.metric?.id).toBe('rd_expense');
    });

    it('finds net income', () => {
      const result = parseQuery('GOOGL net income');
      expect(result.metric?.id).toBe('net_income');
    });

    it('finds operating cash flow via "OCF"', () => {
      const result = parseQuery('TSLA OCF');
      expect(result.metric?.id).toBe('operating_cash_flow');
    });

    it('finds capex', () => {
      const result = parseQuery('AMZN capex');
      expect(result.metric?.id).toBe('capex');
    });

    it('finds SBC', () => {
      const result = parseQuery('META stock based compensation');
      expect(result.metric?.id).toBe('sbc');
    });

    it('finds debt', () => {
      const result = parseQuery('AAPL total debt');
      expect(result.metric?.id).toBe('total_debt');
    });

    it('returns null/undefined for unrecognized metric', () => {
      const result = parseQuery('AAPL employees');
      expect(result.metric).toBeFalsy();
    });
  });

  describe('year extraction', () => {
    it('extracts "last 5 years"', () => {
      const result = parseQuery('AAPL revenue last 5 years');
      expect(result.years).toBe(5);
    });

    it('extracts "past 3 years"', () => {
      const result = parseQuery('AAPL revenue past 3 years');
      expect(result.years).toBe(3);
    });

    it('extracts "10 years"', () => {
      const result = parseQuery('MSFT revenue 10 years');
      expect(result.years).toBe(10);
    });

    it('defaults to 5 years', () => {
      const result = parseQuery('AAPL revenue');
      expect(result.years).toBe(5);
    });

    it('ignores unreasonable year counts (>20)', () => {
      const result = parseQuery('AAPL revenue 50 years');
      expect(result.years).toBe(5);
    });
  });

  describe('quarterly detection', () => {
    it('detects "quarterly"', () => {
      const result = parseQuery('AAPL revenue quarterly');
      expect(result.periodType).toBe('quarterly');
    });

    it('detects "8 quarters"', () => {
      const result = parseQuery('AAPL revenue 8 quarters');
      expect(result.periodType).toBe('quarterly');
      expect(result.quarters).toBe(8);
    });

    it('defaults to annual', () => {
      const result = parseQuery('AAPL revenue 5 years');
      expect(result.periodType).toBe('annual');
    });

    it('defaults quarterly to 8 quarters', () => {
      const result = parseQuery('AAPL revenue quarterly');
      expect(result.quarters).toBe(8);
    });
  });

  describe('full golden query', () => {
    it('parses "How has Apple\'s R&D spending changed over the last 5 fiscal years?"', () => {
      const result = parseQuery("How has Apple's R&D spending changed over the last 5 fiscal years?");
      expect(result.company).toBe('Apple');
      expect(result.metric?.id).toBe('rd_expense');
      expect(result.years).toBe(5);
      expect(result.periodType).toBe('annual');
    });
  });
});
