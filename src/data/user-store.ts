import { UserRole, USER_ROLES } from '../types/user-role';
import { User, UserRecord } from '../types/user';

/**
 * In-memory user store for demonstration.
 * Replace with database access in production.
 */
const users: Map<string, UserRecord> = new Map();

export function findUserById(id: string): UserRecord | undefined {
  return users.get(id);
}

export function findUserByEmail(email: string): UserRecord | undefined {
  for (const record of users.values()) {
    if (record.email === email) return record;
  }
  return undefined;
}

export function updateUserRole(id: string, role: UserRole): User | undefined {
  const user = users.get(id);
  if (!user) return undefined;

  user.role = role;
  user.updatedAt = new Date();
  users.set(id, user);

  return toPublicUser(user);
}

export function createUser(data: {
  email: string;
  displayName: string;
  passwordHash: string;
}): User {
  const id = crypto.randomUUID();
  const now = new Date();
  const record: UserRecord = {
    id,
    email: data.email,
    displayName: data.displayName,
    passwordHash: data.passwordHash,
    role: UserRole.Attendee,
    emailConfirmed: false,
    createdAt: now,
    updatedAt: now,
  };
  users.set(id, record);
  return toPublicUser(record);
}

export function getAllUsers(): User[] {
  return Array.from(users.values()).map(toPublicUser);
}

/** Strip passwordHash from a UserRecord to produce a safe User object. */
function toPublicUser(record: UserRecord): User {
  const { passwordHash: _, ...user } = record;
  return user;
}

/** Validate that a string is a valid UserRole. */
export function isValidRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/** Reset the store (for testing). */
export function resetUserStore(): void {
  users.clear();
}
