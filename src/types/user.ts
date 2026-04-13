import { UserRole, USER_ROLES, DEFAULT_ROLE } from './user-role';

/**
 * Public user data — safe for API responses (no credentials).
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  emailConfirmed: boolean;
  profilePhotoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Extended user profile including festival and notification preferences.
 * Kept standalone (does not extend User) to allow flexible role/date types for API responses.
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: 'Admin' | 'Organizer' | 'Attendee';
  emailConfirmed: boolean;
  profilePhotoUrl?: string;
  photoUrl?: string;
  pendingEmail?: string;
  createdAt: string;
  updatedAt: string;
  festivalPreferences: {
    genres: string[];
    campingPreferred: boolean;
    locations?: string[];
    [key: string]: unknown;
  };
  notificationPreferences: {
    emailNotifications: boolean;
    pushNotifications: boolean;
    email?: boolean;
    sms?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Request body for updating a user profile (all fields optional for partial updates).
 */
export interface UpdateProfileRequest {
  displayName?: string;
  profilePhotoUrl?: string;
  email?: string;
  festivalPreferences?: {
    campingPreferred?: boolean;
    genres?: string[];
    locations?: string[];
    [key: string]: unknown;
  };
  notificationPreferences?: {
    emailNotifications?: boolean;
    pushNotifications?: boolean;
    email?: boolean;
    sms?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Internal user record including credentials — never return directly in API responses.
 */
export interface UserRecord extends User {
  passwordHash: string;
}

/**
 * Schema definition for the user table (database-agnostic).
 * Can be used as reference for migration scripts.
 */
export const USER_SCHEMA = {
  tableName: 'users',
  columns: {
    id: { type: 'uuid', primaryKey: true },
    email: { type: 'varchar(255)', unique: true, nullable: false },
    displayName: { type: 'varchar(255)', nullable: false },
    passwordHash: { type: 'varchar(255)', nullable: false },
    role: {
      type: 'enum',
      values: [...USER_ROLES],
      nullable: false,
      default: DEFAULT_ROLE,
    },
    emailConfirmed: { type: 'boolean', nullable: false, default: false },
    profilePhotoUrl: { type: 'varchar(512)', nullable: true },
    createdAt: { type: 'timestamp', nullable: false, default: 'now()' },
    updatedAt: { type: 'timestamp', nullable: false, default: 'now()' },
  },
} as const;
