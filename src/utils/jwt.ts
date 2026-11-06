import jwt, { type SignOptions, type Secret } from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface JwtPayload {
  userId: string | number;
  email: string;
  role?: string;
  [key: string]: any;
}

export const generateToken = (
  payload: JwtPayload,
  expiresIn: string | number = env.jwtExpiresIn
): string => {
  const options: SignOptions = {
    expiresIn: expiresIn as any,
  };
  return jwt.sign(payload, env.jwtSecret as Secret, options);
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.jwtSecret as Secret) as JwtPayload;
};
