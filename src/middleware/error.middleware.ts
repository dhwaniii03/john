import { type Request, type Response, type NextFunction } from 'express';
import { env } from '../config/env.js';
import { sendError } from '../utils/response.js';

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('Unhandled Error:', err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  const errorDetails =
    env.nodeEnv === 'development' ? { stack: err.stack, details: err } : undefined;

  sendError(res, message, statusCode, errorDetails);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  sendError(res, `Route ${req.method} ${req.originalUrl} not found`, 404);
};
