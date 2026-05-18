import { UserRole } from './user-role';

/**
 * Represents the authenticated user's JWT claims.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tokenVersion?: number;
}

/**
 * Simulated request object for API route handlers.
 */
export interface ApiRequest {
  user?: AuthUser;
  params: Record<string, string>;
  body: unknown;
}

/**
 * Simulated response object for API route handlers.
 */
export interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
}

/**
 * Next.js-style API route handler.
 */
export type ApiHandler = (req: ApiRequest, res: ApiResponse) => void | Promise<void>;
