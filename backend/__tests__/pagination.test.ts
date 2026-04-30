/**
 * Tests for Pagination Utility (#270, #252)
 *
 * Acceptance criteria:
 * - page defaults to 1
 * - limit defaults to 20
 * - limit is clamped to 100 (max)
 * - page=2 produces the correct OFFSET
 * - invalid / missing values fall back to safe defaults
 */

import { describe, expect, it } from 'vitest';
import { parsePagination, buildPaginatedResponse } from '../src/utils/pagination.js';

describe('parsePagination (#270)', () => {
  it('uses page=1 and limit=20 when params are absent', () => {
    const result = parsePagination({});
    expect(result).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('parses explicit page and limit', () => {
    const result = parsePagination({ page: '3', limit: '10' });
    expect(result).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it('calculates correct offset for page=2, limit=20', () => {
    const result = parsePagination({ page: '2', limit: '20' });
    expect(result.offset).toBe(20);
  });

  it('calculates correct offset for page=3, limit=50', () => {
    const result = parsePagination({ page: '3', limit: '50' });
    expect(result.offset).toBe(100);
  });

  it('clamps limit to 100 when limit > 100 is requested', () => {
    const result = parsePagination({ page: '1', limit: '500' });
    expect(result.limit).toBe(100);
  });

  it('defaults page to 1 when page=0 is sent', () => {
    const result = parsePagination({ page: '0' });
    expect(result.page).toBe(1);
  });

  it('defaults page to 1 when page is negative', () => {
    const result = parsePagination({ page: '-5' });
    expect(result.page).toBe(1);
  });

  it('defaults limit to 20 when limit=0 is sent', () => {
    const result = parsePagination({ limit: '0' });
    expect(result.limit).toBe(20);
  });

  it('defaults both to safe values for non-numeric strings', () => {
    const result = parsePagination({ page: 'abc', limit: 'xyz' });
    expect(result).toEqual({ page: 1, limit: 20, offset: 0 });
  });
});

describe('buildPaginatedResponse (#270)', () => {
  it('returns correct envelope shape', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const params = { page: 2, limit: 10, offset: 10 };
    const result = buildPaginatedResponse(data, 25, params);

    expect(result).toEqual({
      data,
      total: 25,
      page: 2,
      limit: 10,
    });
  });

  it('returns empty data array when there are no results', () => {
    const result = buildPaginatedResponse([], 0, { page: 1, limit: 20, offset: 0 });
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
