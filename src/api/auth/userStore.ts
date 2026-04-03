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
  findById(id: string): Promise<User | null>;
  create(userData: Omit<User, 'id' | 'createdAt' | 'emailConfirmed'>): Promise<User>;
  updatePasswordHash(email: string, passwordHash: string): Promise<void>;
  /**
   * Mark a user's email as confirmed.
   * @returns true if newly confirmed, false if already confirmed.
   * @throws if the user is not found.
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

  async findById(id: string): Promise<User | null> {
    return users.find(u => u.id === id) ?? null;
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

  async updatePasswordHash(email: string, passwordHash: string): Promise<void> {
    const user = users.find(u => u.email === email.toLowerCase());
    if (user) {
      user.passwordHash = passwordHash;
    }
  },

  async confirmEmail(email: string): Promise<boolean> {
    const user = users.find(u => u.email === email.toLowerCase());
    if (!user) {
      throw new Error(`No user found with email: ${email}`);
    }
    if (user.emailConfirmed) {
      return false; // Already confirmed
    }
    user.emailConfirmed = true;
    return true; // Newly confirmed
  },

  clear(): void {
    users.length = 0;
  },
};
