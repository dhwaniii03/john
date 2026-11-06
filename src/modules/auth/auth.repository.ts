import { query } from '../../config/database.js';
import type { TransportMode, UserStatus, AdminStatus } from './auth.types.js';

export interface UserEntity {
  id: number;
  email: string;
  password?: string;
  name: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  profile_image?: string;
  transport_mode: TransportMode;
  status: UserStatus;
  notification_enabled: boolean;
  location_enabled: boolean;
  role: string;
  last_login_at?: Date;
  deleted_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface AdminEntity {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  status: AdminStatus;
  last_login_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class AuthRepository {
  async findByEmail(email: string): Promise<UserEntity | null> {
    const result = await query<UserEntity>(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL LIMIT 1',
      [email]
    );
    return result.rows[0] || null;
  }

  async findById(id: number | string): Promise<UserEntity | null> {
    const result = await query<UserEntity>(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [id]
    );
    return result.rows[0] || null;
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    name: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    transport_mode?: TransportMode;
    role?: string;
  }): Promise<UserEntity> {
    const result = await query<UserEntity>(
      `INSERT INTO users (
        email, password, name, first_name, last_name, phone, transport_mode, role, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
      RETURNING *`,
      [
        data.email.toLowerCase(),
        data.passwordHash,
        data.name,
        data.first_name || null,
        data.last_name || null,
        data.phone || null,
        data.transport_mode || 'DRIVER',
        data.role || 'user',
      ]
    );
    return result.rows[0];
  }

  async updateLastLogin(id: number | string): Promise<void> {
    await query('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
  }

  async updatePassword(id: number | string, passwordHash: string): Promise<void> {
    await query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [
      passwordHash,
      id,
    ]);
  }

  // Admin specific methods
  async findAdminByEmail(email: string): Promise<AdminEntity | null> {
    const result = await query<AdminEntity>(
      'SELECT * FROM admins WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    return result.rows[0] || null;
  }

  async findAdminById(id: number | string): Promise<AdminEntity | null> {
    const result = await query<AdminEntity>(
      'SELECT * FROM admins WHERE id = $1 LIMIT 1',
      [id]
    );
    return result.rows[0] || null;
  }

  async updateAdminLastLogin(id: number | string): Promise<void> {
    await query('UPDATE admins SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
  }
}

export default new AuthRepository();
