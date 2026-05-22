/**
 * ──────────────────────────────────────────────────────────
 * Unit Tests — Pure Helpers (No DB Required)
 * ──────────────────────────────────────────────────────────
 */

const { parsePagination, paginatedResponse } = require('../../helpers/pagination');
const { ServiceError } = require('../../helpers/ServiceError');
const { handleError } = require('../../helpers/handleError');

// ── parsePagination ──────────────────────────────────────

describe('parsePagination', () => {
  const mockReq = (query = {}) => ({ query });

  test('returns defaults when no query params', () => {
    const result = parsePagination(mockReq());
    expect(result).toEqual({ page: 1, limit: 50, skip: 0 });
  });

  test('calculates skip correctly for page 3', () => {
    const result = parsePagination(mockReq({ page: 3, limit: 10 }));
    expect(result).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  test('handles page 1 correctly', () => {
    const result = parsePagination(mockReq({ page: 1, limit: 25 }));
    expect(result.skip).toBe(0);
  });
});

// ── paginatedResponse ────────────────────────────────────

describe('paginatedResponse', () => {
  test('produces correct response shape', () => {
    const result = paginatedResponse({
      data: [{ id: 1 }], total: 100, page: 1, limit: 10,
    });

    expect(result).toEqual({
      success: true,
      count: 100,
      total: 100,
      page: 1,
      pages: 10,
      limit: 10,
      data: [{ id: 1 }],
    });
  });

  test('calculates pages correctly (ceiling)', () => {
    const result = paginatedResponse({ data: [], total: 15, page: 1, limit: 10 });
    expect(result.pages).toBe(2);
  });

  test('handles zero total', () => {
    const result = paginatedResponse({ data: [], total: 0, page: 1, limit: 10 });
    expect(result.pages).toBe(1); // At least 1 page
  });
});

// ── ServiceError ─────────────────────────────────────────

describe('ServiceError', () => {
  test('defaults statusCode to 400', () => {
    const err = new ServiceError('Bad input');
    expect(err.message).toBe('Bad input');
    expect(err.statusCode).toBe(400);
    expect(err).toBeInstanceOf(Error);
  });

  test('accepts custom statusCode', () => {
    const err = new ServiceError('Not found', 404);
    expect(err.statusCode).toBe(404);
  });

  test('is an instance of Error', () => {
    const err = new ServiceError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ServiceError');
  });
});

// ── handleError ──────────────────────────────────────────

describe('handleError', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  test('maps ServiceError.statusCode to res.status()', () => {
    const res = mockRes();
    handleError(res, new ServiceError('Not found', 404));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false, message: 'Not found',
    });
  });

  test('defaults to 500 for unknown errors', () => {
    const res = mockRes();
    handleError(res, new Error('Something broke'));
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
