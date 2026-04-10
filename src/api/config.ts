// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
export const API_BASE_URL = env['VITE_API_BASE_URL'] ?? process.env['VITE_API_BASE_URL'] ?? '/api';

