export interface AuthenticatedUser {
  id: number;
  email: string;
  role: string;
  transport_mode?: string;
  name?: string;
}

export interface AuthenticatedAdmin {
  id: number;
  email: string;
  role: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      admin?: AuthenticatedAdmin;
    }
  }
}

export {};
