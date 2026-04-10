import { randomUUID } from 'node:crypto';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  emailConfirmed: boolean;
  createdAt: Date;
}

export interface UserStore {
  findByEmail(email: string): Promise<User | null>;
  create(userData: Omit<User, 'id' | 'createdAt' | 'emailConfirmed'>): Promise<User>;
  /**
   * Mark the user with the given email as confirmed.
   * Returns true if newly confirmed, false if already confirmed.
   * Throws if no user matches the email.
   */
  confirmEmail(email: string): Promise<boolean>;
  /** Clear all users — intended for use in tests only */
  clear(): void;
}

const users: User[] = [];

export const inMemoryUserStore: UserStore = {
  async findByEmail(email: string): Promise<User | null> {
    return users.find(u => u.email === email.toLowerCase()) ?? null;
  },

  async create(userData: Omit<User, 'id' | 'createdAt' | 'emailConfirmed'>): Promise<User> {
    const user: User = {
      ...userData,
      id: randomUUID(),
      emailConfirmed: false,
      createdAt: new Date(),
    };
    users.push(user);
    return user;
  },

  async confirmEmail(email: string): Promise<boolean> {
    const user = users.find(u => u.email === email.toLowerCase());
    if (!user) throw new Error(`No user found for email: ${email}`);
    if (user.emailConfirmed) return false;
    user.emailConfirmed = true;
    return true;
  },

  clear(): void {
    users.length = 0;
  },
};
