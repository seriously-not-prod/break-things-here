import { UserRole } from '../../types/user-role';
import { ApiRequest, ApiResponse } from '../../types/api';
import { handleUpdateUserRole } from '../../api/admin/update-user-role';
import { createUser, resetUserStore } from '../../data/user-store';
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

describe('PATCH /api/admin/users/:id/role', () => {
  let adminUser: { id: string };
  let targetUser: { id: string };

  beforeEach(() => {
    resetUserStore();
    adminUser = createUser({
      email: 'admin@test.com',
      displayName: 'Admin User',
      passwordHash: 'hashed',
    });
    // Manually promote to Admin (createUser defaults to Attendee)
    const { updateUserRole } = require('../../data/user-store');
    updateUserRole(adminUser.id, UserRole.Admin);

    targetUser = createUser({
      email: 'target@test.com',
      displayName: 'Target User',
      passwordHash: 'hashed',
    });
  });

  it('should return 401 when not authenticated', () => {
    const req: ApiRequest = {
      user: undefined,
      params: { id: targetUser.id },
      body: { role: 'Organizer' },
    };
    const res = createMockRes();

    handleUpdateUserRole(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
    expect(res.body).toEqual(AUTH_ERRORS.UNAUTHENTICATED);
  });

  it('should return 403 when caller is not Admin', () => {
    const req: ApiRequest = {
      user: { id: targetUser.id, email: 'target@test.com', role: UserRole.Attendee },
      params: { id: targetUser.id },
      body: { role: 'Organizer' },
    };
    const res = createMockRes();

    handleUpdateUserRole(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.FORBIDDEN);
    expect(res.body).toEqual(AUTH_ERRORS.FORBIDDEN);
  });

  it('should return 403 when Organizer tries to assign roles', () => {
    const req: ApiRequest = {
      user: { id: 'org-id', email: 'org@test.com', role: UserRole.Organizer },
      params: { id: targetUser.id },
      body: { role: 'Admin' },
    };
    const res = createMockRes();

    handleUpdateUserRole(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.FORBIDDEN);
  });

  it('should return 400 for invalid role value', () => {
    const req: ApiRequest = {
      user: { id: adminUser.id, email: 'admin@test.com', role: UserRole.Admin },
      params: { id: targetUser.id },
      body: { role: 'SuperUser' },
    };
    const res = createMockRes();

    handleUpdateUserRole(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(res.body).toEqual(AUTH_ERRORS.INVALID_ROLE);
  });

  it('should return 400 when role is missing', () => {
    const req: ApiRequest = {
      user: { id: adminUser.id, email: 'admin@test.com', role: UserRole.Admin },
      params: { id: targetUser.id },
      body: {},
    };
    const res = createMockRes();

    handleUpdateUserRole(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
  });

  it('should return 404 when target user does not exist', () => {
    const req: ApiRequest = {
      user: { id: adminUser.id, email: 'admin@test.com', role: UserRole.Admin },
      params: { id: 'nonexistent-id' },
      body: { role: 'Organizer' },
    };
    const res = createMockRes();

    handleUpdateUserRole(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
    expect(res.body).toEqual(AUTH_ERRORS.USER_NOT_FOUND);
  });

  it('should return 200 with updated user on success', () => {
    const req: ApiRequest = {
      user: { id: adminUser.id, email: 'admin@test.com', role: UserRole.Admin },
      params: { id: targetUser.id },
      body: { role: 'Organizer' },
    };
    const res = createMockRes();

    handleUpdateUserRole(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.OK);
    expect(res.body).toMatchObject({
      id: targetUser.id,
      role: UserRole.Organizer,
    });
  });

  it('should prevent admin from demoting their own account', () => {
    const req: ApiRequest = {
      user: { id: adminUser.id, email: 'admin@test.com', role: UserRole.Admin },
      params: { id: adminUser.id },
      body: { role: 'Attendee' },
    };
    const res = createMockRes();

    handleUpdateUserRole(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.FORBIDDEN);
    expect(res.body).toEqual(AUTH_ERRORS.SELF_ROLE_CHANGE);
  });

  it('should allow admin to keep their own Admin role', () => {
    const req: ApiRequest = {
      user: { id: adminUser.id, email: 'admin@test.com', role: UserRole.Admin },
      params: { id: adminUser.id },
      body: { role: 'Admin' },
    };
    const res = createMockRes();

    handleUpdateUserRole(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.OK);
  });

  it('should not include passwordHash in response', () => {
    const req: ApiRequest = {
      user: { id: adminUser.id, email: 'admin@test.com', role: UserRole.Admin },
      params: { id: targetUser.id },
      body: { role: 'Organizer' },
    };
    const res = createMockRes();

    handleUpdateUserRole(req, res);

    expect(res.statusCode).toBe(HTTP_STATUS.OK);
    expect(res.body).not.toHaveProperty('passwordHash');
  });
});
