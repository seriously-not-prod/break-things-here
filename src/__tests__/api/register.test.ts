import { UserRole } from '../../types/user-role';
import { ApiRequest, ApiResponse } from '../../types/api';
import { handleRegister } from '../../api/auth/register';
import { resetUserStore } from '../../data/user-store';

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

describe('POST /api/auth/register', () => {
  beforeEach(() => resetUserStore());

  it('should create user with Attendee role by default', () => {
    const req: ApiRequest = {
      params: {},
      body: {
        email: 'new@test.com',
        displayName: 'New User',
        password: 'SecurePass123!',
      },
    };
    const res = createMockRes();

    handleRegister(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      email: 'new@test.com',
      displayName: 'New User',
      role: UserRole.Attendee,
    });
  });

  it('should ignore role field in request body', () => {
    const req: ApiRequest = {
      params: {},
      body: {
        email: 'hacker@test.com',
        displayName: 'Hacker',
        password: 'pass',
        role: 'Admin', // attempt to escalate
      },
    };
    const res = createMockRes();

    handleRegister(req, res);

    expect(res.statusCode).toBe(201);
    expect((res.body as { role: string }).role).toBe(UserRole.Attendee);
  });

  it('should return 400 when email is missing', () => {
    const req: ApiRequest = {
      params: {},
      body: { displayName: 'User', password: 'pass' },
    };
    const res = createMockRes();

    handleRegister(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when displayName is missing', () => {
    const req: ApiRequest = {
      params: {},
      body: { email: 'user@test.com', password: 'pass' },
    };
    const res = createMockRes();

    handleRegister(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when password is missing', () => {
    const req: ApiRequest = {
      params: {},
      body: { email: 'user@test.com', displayName: 'User' },
    };
    const res = createMockRes();

    handleRegister(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('should not include passwordHash in response', () => {
    const req: ApiRequest = {
      params: {},
      body: {
        email: 'safe@test.com',
        displayName: 'Safe User',
        password: 'pass123',
      },
    };
    const res = createMockRes();

    handleRegister(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('should set emailConfirmed to false', () => {
    const req: ApiRequest = {
      params: {},
      body: {
        email: 'unconfirmed@test.com',
        displayName: 'Unconfirmed',
        password: 'pass',
      },
    };
    const res = createMockRes();

    handleRegister(req, res);

    expect(res.statusCode).toBe(201);
    expect((res.body as { emailConfirmed: boolean }).emailConfirmed).toBe(false);
  });
});
