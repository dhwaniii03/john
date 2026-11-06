import { type Request, type Response, type NextFunction } from 'express';
import { ZodError, type ZodType } from 'zod';
import { sendError } from '../utils/response.js';

export const validateBody = (schema: ZodType) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error: any) {
      if (error instanceof ZodError || error?.name === 'ZodError' || Array.isArray(error?.issues)) {
        const issues = error.issues || [];
        const formattedErrors = issues.map((issue: any) => ({
          field: issue.path?.join('.') || '',
          message: issue.message,
        }));
        sendError(res, 'Validation failed', 400, formattedErrors);
        return;
      }
      sendError(res, 'Invalid request data', 400, error?.message || error);
    }
  };
};

export const validateQuery = (schema: ZodType) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req.query);
      // Mutate/assign safely without breaking Express query getters
      try {
        req.query = parsed as any;
      } catch {
        Object.assign(req.query, parsed);
      }
      next();
    } catch (error: any) {
      if (error instanceof ZodError || error?.name === 'ZodError' || Array.isArray(error?.issues)) {
        const issues = error.issues || [];
        const formattedErrors = issues.map((issue: any) => ({
          field: issue.path?.join('.') || '',
          message: issue.message,
        }));
        sendError(res, 'Invalid query parameters', 400, formattedErrors);
        return;
      }
      sendError(res, 'Invalid query parameters', 400, error?.message || error);
    }
  };
};

export const validateParams = (schema: ZodType) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req.params);
      try {
        req.params = parsed as any;
      } catch {
        Object.assign(req.params, parsed);
      }
      next();
    } catch (error: any) {
      if (error instanceof ZodError || error?.name === 'ZodError' || Array.isArray(error?.issues)) {
        const issues = error.issues || [];
        const formattedErrors = issues.map((issue: any) => ({
          field: issue.path?.join('.') || '',
          message: issue.message,
        }));
        sendError(res, 'Invalid route parameters', 400, formattedErrors);
        return;
      }
      sendError(res, 'Invalid route parameters', 400, error?.message || error);
    }
  };
};
