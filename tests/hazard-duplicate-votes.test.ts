import { describe, it, expect, vi, beforeEach } from 'vitest';
import pool from '../src/config/database.js';
import hazardRepository from '../src/modules/hazards/hazard.repository.js';
import hazardController from '../src/modules/hazards/hazard.controller.js';
import hazardService from '../src/modules/hazards/hazard.service.js';
import type { Request, Response } from 'express';

describe('Hazard Duplicate Vote Prevention', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('hazard.controller.ts error mapping', () => {
    it('returns 409 Conflict when hazard is already confirmed by user', async () => {
      vi.spyOn(hazardService, 'confirmHazard').mockRejectedValue(
        new Error('You have already confirmed this hazard')
      );

      const req = {
        params: { id: '42' },
        user: { id: 101 },
      } as unknown as Request;

      let statusCode = 0;
      let responseBody: any = null;

      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          responseBody = data;
          return res;
        },
      } as unknown as Response;

      await hazardController.confirmHazard(req, res, () => {});

      expect(statusCode).toBe(409);
      expect(responseBody.success).toBe(false);
      expect(responseBody.message).toBe('You have already confirmed this hazard');
    });

    it('returns 409 Conflict when resolution is already submitted by user', async () => {
      vi.spyOn(hazardService, 'resolveHazard').mockRejectedValue(
        new Error('You have already submitted a resolution for this hazard')
      );

      const req = {
        params: { id: '42' },
        user: { id: 101 },
      } as unknown as Request;

      let statusCode = 0;
      let responseBody: any = null;

      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          responseBody = data;
          return res;
        },
      } as unknown as Response;

      await hazardController.resolveHazard(req, res, () => {});

      expect(statusCode).toBe(409);
      expect(responseBody.success).toBe(false);
      expect(responseBody.message).toBe('You have already submitted a resolution for this hazard');
    });

    it('returns 404 when hazard is not found', async () => {
      vi.spyOn(hazardService, 'confirmHazard').mockRejectedValue(
        new Error('Hazard not found')
      );

      const req = {
        params: { id: '999' },
        user: { id: 101 },
      } as unknown as Request;

      let statusCode = 0;
      let responseBody: any = null;

      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          responseBody = data;
          return res;
        },
      } as unknown as Response;

      await hazardController.confirmHazard(req, res, () => {});

      expect(statusCode).toBe(404);
      expect(responseBody.success).toBe(false);
    });
  });

  describe('hazard.repository.ts duplicate vote checks & unique violation handling', () => {
    it('throws error when user has already confirmed the hazard in database check', async () => {
      const mockClient = {
        query: vi.fn().mockImplementation((queryText: string) => {
          if (queryText === 'BEGIN' || queryText === 'ROLLBACK' || queryText === 'COMMIT') {
            return Promise.resolve({ rows: [] });
          }
          if (queryText.includes('SELECT * FROM hazards WHERE id = $1 FOR UPDATE')) {
            return Promise.resolve({ rows: [{ id: 42, title: 'Pothole' }] });
          }
          if (queryText.includes('SELECT id FROM hazard_confirmations WHERE hazard_id = $1 AND user_id = $2')) {
            return Promise.resolve({ rows: [{ id: 1 }] }); // Already confirmed
          }
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };

      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient as any);

      await expect(hazardRepository.confirmHazard(42, 101)).rejects.toThrow(
        'You have already confirmed this hazard'
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('catches PostgreSQL 23505 unique violation in confirmHazard and throws descriptive error', async () => {
      const mockClient = {
        query: vi.fn().mockImplementation((queryText: string) => {
          if (queryText === 'BEGIN' || queryText === 'ROLLBACK') {
            return Promise.resolve({ rows: [] });
          }
          if (queryText.includes('SELECT * FROM hazards WHERE id = $1 FOR UPDATE')) {
            return Promise.resolve({ rows: [{ id: 42, title: 'Pothole' }] });
          }
          if (queryText.includes('SELECT id FROM hazard_confirmations WHERE hazard_id = $1 AND user_id = $2')) {
            return Promise.resolve({ rows: [] }); // Simulates race where check passes
          }
          if (queryText.includes('INSERT INTO hazard_confirmations')) {
            const err: any = new Error('duplicate key value violates unique constraint "idx_hazard_confirmations_unique_user"');
            err.code = '23505';
            return Promise.reject(err);
          }
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };

      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient as any);

      await expect(hazardRepository.confirmHazard(42, 101)).rejects.toThrow(
        'You have already confirmed this hazard'
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('throws error when user has already submitted a resolution in database check', async () => {
      const mockClient = {
        query: vi.fn().mockImplementation((queryText: string) => {
          if (queryText === 'BEGIN' || queryText === 'ROLLBACK' || queryText === 'COMMIT') {
            return Promise.resolve({ rows: [] });
          }
          if (queryText.includes('SELECT * FROM hazards WHERE id = $1 FOR UPDATE')) {
            return Promise.resolve({ rows: [{ id: 42, title: 'Pothole', resolved_count: 0 }] });
          }
          if (queryText.includes('SELECT id FROM hazard_resolutions WHERE hazard_id = $1 AND user_id = $2')) {
            return Promise.resolve({ rows: [{ id: 1 }] }); // Already submitted
          }
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };

      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient as any);

      await expect(hazardRepository.resolveHazard(42, 101)).rejects.toThrow(
        'You have already submitted a resolution for this hazard'
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('catches PostgreSQL 23505 unique violation in resolveHazard and throws descriptive error', async () => {
      const mockClient = {
        query: vi.fn().mockImplementation((queryText: string) => {
          if (queryText === 'BEGIN' || queryText === 'ROLLBACK') {
            return Promise.resolve({ rows: [] });
          }
          if (queryText.includes('SELECT * FROM hazards WHERE id = $1 FOR UPDATE')) {
            return Promise.resolve({ rows: [{ id: 42, title: 'Pothole', resolved_count: 0 }] });
          }
          if (queryText.includes('SELECT id FROM hazard_resolutions WHERE hazard_id = $1 AND user_id = $2')) {
            return Promise.resolve({ rows: [] }); // Simulates race where check passes
          }
          if (queryText.includes('INSERT INTO hazard_resolutions')) {
            const err: any = new Error('duplicate key value violates unique constraint "idx_hazard_resolutions_unique_user"');
            err.code = '23505';
            return Promise.reject(err);
          }
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };

      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient as any);

      await expect(hazardRepository.resolveHazard(42, 101)).rejects.toThrow(
        'You have already submitted a resolution for this hazard'
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});
