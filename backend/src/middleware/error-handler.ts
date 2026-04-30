/**
 * Global Express Error Handler
 *
 * Provides a consistent { error, code } JSON error response for all unhandled
 * errors that propagate through next(err) or are thrown in async controllers
 * wrapped with asyncHandler().
 *
 * Addresses: #268 (Task), #291 (Sub-Task), #254 (Story)
 */

import { Request, Response, NextFunction } from 'express';

// ─── Custom Application Error ────────────────────────────────────────────────

/**
 * Structured error class that carries an HTTP status code and an optional
 * machine-readable error code for API consumers.
 */
export class AppError extends Error {
  /** HTTP status code to return (defaults to 500). */
  public readonly status: number;
  /** Optional machine-readable code for clients (e.g. "VALIDATION_ERROR"). */
  public readonly code: string | undefined;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    // Maintain proper prototype chain when targeting ES5 transpilation
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Async Controller Wrapper ─────────────────────────────────────────────────

/**
 * Wraps an async Express request handler so that any rejected promise or
 * thrown error is forwarded to the Express error pipeline via next(err).
 *
 * Usage:
 *   router.get('/example', asyncHandler(async (req, res) => {
 *     const data = await someAsyncOperation();
 *     res.json(data);
 *   }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ─── Error Response Shape ─────────────────────────────────────────────────────

interface ErrorResponseBody {
  error: string;
  code?: string;
}

// ─── Global Error Middleware ──────────────────────────────────────────────────

/**
 * Express 4-argument error middleware.
 * Must be mounted *after* all routes with app.use(errorHandler).
 *
 * Handles:
 * - AppError instances → use attached status and code
 * - multer/file-upload errors → 400
 * - Generic Error objects → 500
 * - Unknown thrown values → 500
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // next is required by Express to recognise this as an error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Structured application errors
  if (err instanceof AppError) {
    const body: ErrorResponseBody = { error: err.message };
    if (err.code) body.code = err.code;
    res.status(err.status).json(body);
    return;
  }

  // Multer file-upload errors carry a `code` property (e.g. LIMIT_FILE_SIZE)
  if (
    err instanceof Error &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string'
  ) {
    const multerCode = (err as { code: string }).code;
    const statusCode = multerCode === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const body: ErrorResponseBody = { error: err.message, code: multerCode };
    res.status(statusCode).json(body);
    return;
  }

  // Standard Error objects
  if (err instanceof Error) {
    // Log full stack for server-side diagnostics (do not expose to client)
    console.error('[ErrorHandler]', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  // Unknown thrown values (e.g. throw "string")
  console.error('[ErrorHandler] Unknown error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
