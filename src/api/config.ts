const env = (
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as Record<string, string | undefined>)
    : {}
) as Record<string, string | undefined>;
export const API_BASE_URL = env['VITE_API_BASE_URL'] ?? process.env['VITE_API_BASE_URL'] ?? '/api';
