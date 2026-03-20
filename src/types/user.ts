import { UserRole, DEFAULT_ROLE } from './user-role';

/**
 * User data model representing a user record in the database.
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  emailConfirmed: boolean;
  profilePhotoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
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
      values: Object.values(UserRole),
      nullable: false,
      default: DEFAULT_ROLE,
    },
    emailConfirmed: { type: 'boolean', nullable: false, default: false },
    profilePhotoUrl: { type: 'varchar(512)', nullable: true },
    createdAt: { type: 'timestamp', nullable: false, default: 'now()' },
    updatedAt: { type: 'timestamp', nullable: false, default: 'now()' },
  },
} as const;
