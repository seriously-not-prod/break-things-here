import { randomUUID } from 'node:crypto';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface UserStore {
  findByEmail(email: string): Promise<User | null>;
  create(userData: Omit<User, 'id' | 'createdAt'>): Promise<User>;
  /** Clear all users — intended for use in tests only */
  clear(): void;
}

const users: User[] = [];

export const inMemoryUserStore: UserStore = {
  async findByEmail(email: string): Promise<User | null> {
    return users.find(u => u.email === email.toLowerCase()) ?? null;
  },

  async create(userData: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const user: User = {
      ...userData,
      id: randomUUID(),
      createdAt: new Date(),
    };
    users.push(user);
    return user;
  },

  clear(): void {
    users.length = 0;
  },
};
