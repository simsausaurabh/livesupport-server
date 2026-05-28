import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>
  ) { super(message); this.name = 'AppError'; }
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `${req.method} ${req.path} not found` } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: err.flatten().fieldErrors as Record<string, string[]> } });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}

// Wraps async route handlers — eliminates try/catch boilerplate
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => { fn(req, res, next).catch(next); };
}
