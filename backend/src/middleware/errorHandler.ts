import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  details?: any;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Do not expose database internals or unexpected stack traces to clients in production
  let message = err.message || 'Internal Server Error';
  if (statusCode === 500 && isProduction) {
    message = 'An unexpected server error occurred. Please try again later.';
  }

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[Error] ${req.method} ${req.originalUrl} - ${statusCode}: ${err.message}`);
    if (err.stack && !isProduction) {
      console.error(err.stack);
    }
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(err.details && !isProduction ? { details: err.details } : {}),
  });
};
