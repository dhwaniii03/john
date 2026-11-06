import { type Request, type Response, type NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { sendError } from '../utils/response.js';
import { pool } from '../config/database.js';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 'Authentication token is required', 401);
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      sendError(res, 'Invalid token payload', 401);
      return;
    }

    const isAdminToken = decoded.role === 'GLOBAL_ADMIN' || decoded.role === 'admin';

    if (isAdminToken) {
      const adminResult = await pool.query(
        'SELECT id, email, name, role, status FROM admins WHERE id = $1',
        [decoded.userId]
      );
      if (adminResult.rows.length > 0) {
        const admin = adminResult.rows[0];
        if (admin.status && admin.status.toUpperCase() === 'SUSPENDED') {
          sendError(res, 'Admin account has been suspended', 403);
          return;
        }
        req.admin = {
          id: Number(admin.id),
          email: admin.email,
          name: admin.name,
          role: admin.role || 'GLOBAL_ADMIN',
        };
        req.user = {
          id: Number(admin.id),
          email: admin.email,
          name: admin.name,
          role: 'admin',
          transport_mode: 'DRIVER',
        };
        return next();
      }
    }

    // Verify user in database
    const userResult = await pool.query(
      'SELECT id, email, name, role, transport_mode, status, deleted_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      sendError(res, 'User account not found', 401);
      return;
    }

    const user = userResult.rows[0];

    if (user.deleted_at) {
      sendError(res, 'Account has been deleted', 403);
      return;
    }

    if (user.status && user.status.toUpperCase() === 'SUSPENDED') {
      sendError(res, 'Account has been suspended', 403);
      return;
    }

    req.user = {
      id: Number(user.id),
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      transport_mode: user.transport_mode || 'DRIVER',
    };

    if (user.role === 'admin' || user.role === 'GLOBAL_ADMIN') {
      req.admin = {
        id: Number(user.id),
        email: user.email,
        name: user.name,
        role: user.role,
      };
    }

    next();
  } catch (error: any) {
    sendError(res, 'Invalid or expired authentication token', 401, error.message);
  }
};

export const authenticateAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 'Admin authentication token is required', 401);
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      sendError(res, 'Invalid admin token payload', 401);
      return;
    }

    // First check admins table
    const adminResult = await pool.query(
      'SELECT id, email, name, role, status FROM admins WHERE id = $1',
      [decoded.userId]
    );

    if (adminResult.rows.length > 0) {
      const admin = adminResult.rows[0];
      if (admin.status && admin.status.toUpperCase() === 'SUSPENDED') {
        sendError(res, 'Admin account has been suspended', 403);
        return;
      }

      req.admin = {
        id: Number(admin.id),
        email: admin.email,
        name: admin.name,
        role: admin.role || 'GLOBAL_ADMIN',
      };
      req.user = {
        id: Number(admin.id),
        email: admin.email,
        name: admin.name,
        role: 'admin',
      };
      return next();
    }

    // Fallback check users table for admin role
    const userAdminResult = await pool.query(
      'SELECT id, email, name, role, status, deleted_at FROM users WHERE id = $1 AND (role = $2 OR role = $3)',
      [decoded.userId, 'admin', 'GLOBAL_ADMIN']
    );

    if (userAdminResult.rows.length > 0) {
      const userAdmin = userAdminResult.rows[0];
      if (userAdmin.deleted_at) {
        sendError(res, 'Account has been deleted', 403);
        return;
      }
      if (userAdmin.status && userAdmin.status.toUpperCase() === 'SUSPENDED') {
        sendError(res, 'Account has been suspended', 403);
        return;
      }

      req.admin = {
        id: Number(userAdmin.id),
        email: userAdmin.email,
        name: userAdmin.name,
        role: 'GLOBAL_ADMIN',
      };
      req.user = {
        id: Number(userAdmin.id),
        email: userAdmin.email,
        name: userAdmin.name,
        role: 'admin',
      };
      return next();
    }

    sendError(res, 'Forbidden: Admin privileges required', 403);
  } catch (error: any) {
    sendError(res, 'Invalid or expired admin authentication token', 401, error.message);
  }
};

export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user && !req.admin) {
      sendError(res, 'Authentication required', 401);
      return;
    }

    const currentRole = req.admin?.role || req.user?.role;

    if (allowedRoles.length > 0) {
      const isAllowed = allowedRoles.some(
        (role) =>
          role.toLowerCase() === (currentRole || '').toLowerCase() ||
          (role.toLowerCase() === 'admin' &&
            (currentRole === 'GLOBAL_ADMIN' || currentRole === 'admin'))
      );

      if (!isAllowed) {
        sendError(res, 'Forbidden: Insufficient permissions', 403);
        return;
      }
    }

    next();
  };
};
