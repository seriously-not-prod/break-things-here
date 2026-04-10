import { UserRole } from '../../types/user-role';
import { ApiRequest, ApiResponse } from '../../types/api';
import { requireRole, requireAuth } from '../../middleware/rbac';
import { HTTP_STATUS, AUTH_ERRORS } from '../../utils/http-errors';

function createMockRes(): ApiResponse & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
    },
  };
  return res;
}

function createMockReq(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    params: {},
    body: {},
    ...overrides,
  };
}

describe('requireRole middleware', () => {
  const handler = vi.fn();

  beforeEach(() => handler.mockReset());

  it('should return 401 when user is not authenticated', () => {
    const wrapped = requireRole(UserRole.Admin, handler);
    const req = createMockReq();
    const res = createMockRes();

    wrapped(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
    expect(res.body).toEqual(AUTH_ERRORS.UNAUTHENTICATED);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should return 403 when user role is not in allowed list', () => {
    const wrapped = requireRole(UserRole.Admin, handler);
    const req = createMockReq({
      user: { id: '1', email: 'user@test.com', role: UserRole.Attendee },
    });
    const res = createMockRes();

    wrapped(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.FORBIDDEN);
    expect(res.body).toEqual(AUTH_ERRORS.FORBIDDEN);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should call handler when user has the required role', () => {
    const wrapped = requireRole(UserRole.Admin, handler);
    const req = createMockReq({
      user: { id: '1', email: 'admin@test.com', role: UserRole.Admin },
    });
    const res = createMockRes();

    wrapped(req, res);

    expect(handler).toHaveBeenCalledWith(req, res);
  });

  it('should accept an array of allowed roles', () => {
    const wrapped = requireRole([UserRole.Admin, UserRole.Organizer], handler);
    const req = createMockReq({
      user: { id: '1', email: 'org@test.com', role: UserRole.Organizer },
    });
    const res = createMockRes();

    wrapped(req, res);

    expect(handler).toHaveBeenCalledWith(req, res);
  });

  it('should return 403 when role is not in the array of allowed roles', () => {
    const wrapped = requireRole([UserRole.Admin, UserRole.Organizer], handler);
    const req = createMockReq({
      user: { id: '1', email: 'att@test.com', role: UserRole.Attendee },
    });
    const res = createMockRes();

    wrapped(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.FORBIDDEN);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should return 401 (not 403) when no user exists even if roles specified', () => {
    const wrapped = requireRole([UserRole.Admin], handler);
    const req = createMockReq({ user: undefined });
    const res = createMockRes();

    wrapped(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
    expect(res.body).toEqual(AUTH_ERRORS.UNAUTHENTICATED);
  });
});

describe('requireAuth middleware', () => {
  const handler = vi.fn();

  beforeEach(() => handler.mockReset());

  it('should return 401 when user is not authenticated', () => {
    const wrapped = requireAuth(handler);
    const req = createMockReq();
    const res = createMockRes();

    wrapped(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should call handler for any authenticated role', () => {
    for (const role of [UserRole.Admin, UserRole.Organizer, UserRole.Attendee]) {
      handler.mockReset();
      const wrapped = requireAuth(handler);
      const req = createMockReq({
        user: { id: '1', email: 'user@test.com', role },
      });
      const res = createMockRes();

      wrapped(req, res);

      expect(handler).toHaveBeenCalledWith(req, res);
    }
  });
});
