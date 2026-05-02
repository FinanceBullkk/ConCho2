/**
 * ──────────────────────────────────────────────────────────
 * Unit Tests — Middleware (Mocked req/res/next)
 * ──────────────────────────────────────────────────────────
 */

const { roleGuard } = require('../../middleware/roleGuard');

// ── Helpers ──────────────────────────────────────────────

const mockReq = (user = null) => ({ user });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext = () => jest.fn();

// ── roleGuard ────────────────────────────────────────────

describe('roleGuard', () => {
  test('allows matching role (Admin)', () => {
    const guard = roleGuard('Admin');
    const req = mockReq({ role: 'Admin' });
    const res = mockRes();
    const next = mockNext();

    guard(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('allows any of multiple roles', () => {
    const guard = roleGuard('Admin', 'Teacher');
    const req = mockReq({ role: 'Teacher' });
    const res = mockRes();
    const next = mockNext();

    guard(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('blocks non-matching role with 403', () => {
    const guard = roleGuard('Admin');
    const req = mockReq({ role: 'Participant' });
    const res = mockRes();
    const next = mockNext();

    guard(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Participant'),
      })
    );
  });

  test('returns 401 when no user attached', () => {
    const guard = roleGuard('Admin');
    const req = mockReq(null); // no user
    const res = mockRes();
    const next = mockNext();

    guard(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
