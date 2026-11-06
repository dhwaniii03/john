import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import { generateToken } from '../src/utils/jwt.js';

// Mock pool.query to simulate database user states without database mutation
vi.mock('../src/config/database.js', async () => {
  const actual = await vi.importActual('../src/config/database.js');
  return {
    ...actual,
    pool: {
      query: vi.fn(async (text: string, params: any[]) => {
        const userId = params?.[0];
        if (userId === 101) {
          return {
            rows: [
              {
                id: 101,
                email: 'active@test.com',
                name: 'Active User',
                role: 'user',
                transport_mode: 'DRIVER',
                status: 'ACTIVE',
                deleted_at: null,
              },
            ],
          };
        }
        if (userId === 102) {
          return {
            rows: [
              {
                id: 102,
                email: 'suspended@test.com',
                name: 'Suspended User',
                role: 'user',
                transport_mode: 'DRIVER',
                status: 'SUSPENDED',
                deleted_at: null,
              },
            ],
          };
        }
        if (userId === 103) {
          return {
            rows: [
              {
                id: 103,
                email: 'deleted@test.com',
                name: 'Deleted User',
                role: 'user',
                transport_mode: 'DRIVER',
                status: 'ACTIVE',
                deleted_at: new Date(),
              },
            ],
          };
        }
        if (userId === 104) {
          return {
            rows: [
              {
                id: 104,
                email: 'adminuser@test.com',
                name: 'Admin User',
                role: 'admin',
                transport_mode: 'DRIVER',
                status: 'ACTIVE',
                deleted_at: null,
              },
            ],
          };
        }
        return { rows: [] };
      }),
    },
  };
});

describe('WebSocket Handshake Authentication & Concurrency', () => {
  let server: http.Server;
  let serverPort: number;
  let closeLocationSocket: () => Promise<void>;

  beforeAll(async () => {
    process.env.LOCATION_SOCKET_ENABLED = 'true';
    const { env } = await import('../src/config/env.js');
    env.locationSocketEnabled = true;

    server = http.createServer();
    const socketModule = await import('../src/websocket/location.socket.js');
    socketModule.initLocationSocket(server);
    closeLocationSocket = socketModule.closeLocationSocket;

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await closeLocationSocket();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const connectClient = (auth?: Record<string, any>): Promise<ClientSocket> => {
    return new Promise((resolve, reject) => {
      const client = Client(`http://127.0.0.1:${serverPort}/location`, {
        transports: ['websocket'],
        auth,
        reconnection: false,
      });

      client.on('connect', () => resolve(client));
      client.on('connect_error', (err) => reject(err));
    });
  };

  it('1. Connects successfully with a valid user token and receives location:config', async () => {
    const token = generateToken({ userId: 101, email: 'active@test.com', role: 'user' });

    const client = Client(`http://127.0.0.1:${serverPort}/location`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
    });

    const configPromise = new Promise((resolve) => {
      client.on('location:config', (data) => resolve(data));
    });

    const config = await configPromise;
    expect(config).toBeDefined();
    expect((config as any).still).toBeDefined();
    client.disconnect();
  });

  it('2. Rejects connection with missing authentication token', async () => {
    await expect(connectClient()).rejects.toThrow(/AUTHENTICATION_FAILED.*token required/i);
  });

  it('3. Rejects connection with an invalid token signature', async () => {
    await expect(connectClient({ token: 'invalid.jwt.token' })).rejects.toThrow(/AUTHENTICATION_FAILED.*invalid/i);
  });

  it('4. Rejects connection with an expired token', async () => {
    const expiredToken = generateToken({ userId: 101, email: 'active@test.com', role: 'user' }, -10);
    await expect(connectClient({ token: expiredToken })).rejects.toThrow(/AUTHENTICATION_FAILED/i);
  });

  it('5. Rejects connection with non-user role tokens (admin, GLOBAL_ADMIN, SUPER_ADMIN)', async () => {
    const adminToken = generateToken({ userId: 999, email: 'admin@test.com', role: 'admin' });
    await expect(connectClient({ token: adminToken })).rejects.toThrow(/AUTHENTICATION_FAILED.*Only user role tokens/i);

    const globalAdminToken = generateToken({ userId: 999, email: 'admin@test.com', role: 'GLOBAL_ADMIN' });
    await expect(connectClient({ token: globalAdminToken })).rejects.toThrow(/AUTHENTICATION_FAILED.*Only user role tokens/i);

    const superAdminToken = generateToken({ userId: 999, email: 'admin@test.com', role: 'SUPER_ADMIN' });
    await expect(connectClient({ token: superAdminToken })).rejects.toThrow(/AUTHENTICATION_FAILED.*Only user role tokens/i);
  });

  it('6. Rejects connection if user account has admin role in database', async () => {
    const token = generateToken({ userId: 104, email: 'adminuser@test.com', role: 'user' });
    await expect(connectClient({ token })).rejects.toThrow(/AUTHENTICATION_FAILED.*Only regular user accounts/i);
  });

  it('7. Rejects connection for suspended user account', async () => {
    const suspendedToken = generateToken({ userId: 102, email: 'suspended@test.com', role: 'user' });
    await expect(connectClient({ token: suspendedToken })).rejects.toThrow(/AUTHENTICATION_FAILED.*suspended/i);
  });

  it('8. Rejects connection for deleted user account', async () => {
    const deletedToken = generateToken({ userId: 103, email: 'deleted@test.com', role: 'user' });
    await expect(connectClient({ token: deletedToken })).rejects.toThrow(/AUTHENTICATION_FAILED.*deleted/i);
  });

  it('9. Third concurrent socket for same user disconnects the oldest socket', async () => {
    const token = generateToken({ userId: 101, email: 'active@test.com', role: 'user' });

    const client1 = await connectClient({ token });
    const client2 = await connectClient({ token });

    const client1DisconnectedPromise = new Promise<{ code: string; message: string }>((resolve) => {
      client1.on('location:error', (err) => resolve(err));
    });

    const client3 = await connectClient({ token });

    const errorEvent = await client1DisconnectedPromise;
    expect(errorEvent.code).toBe('CONCURRENCY_LIMIT');
    expect(client1.connected).toBe(false);
    expect(client2.connected).toBe(true);
    expect(client3.connected).toBe(true);

    client2.disconnect();
    client3.disconnect();
  });

  it('10. Disconnect handler schedules 30s Redis purge only if user has NO other connected socket', async () => {
    const { default: locationService } = await import('../src/modules/locations/location.service.js');
    const { default: locationRedisRepository } = await import('../src/modules/locations/location.redis.repository.js');
    const { connectRedis, isRedisAvailable } = await import('../src/config/redis.js');
    await connectRedis();

    if (!isRedisAvailable()) return;

    const token = generateToken({ userId: 101, email: 'active@test.com', role: 'user' });

    // Populate user 101 in Redis
    await locationRedisRepository.upsertLocation(101, {
      latitude: 12.9716,
      longitude: 77.5946,
      mode: 'DRIVER',
    });

    const cleanupSpy = vi.spyOn(locationService, 'scheduleDisconnectCleanup');

    // Connect socket A and socket B
    const clientA = await connectClient({ token });
    const clientB = await connectClient({ token });
    expect(clientA.connected).toBe(true);
    expect(clientB.connected).toBe(true);

    // Disconnect socket A
    clientA.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    // Confirm scheduleDisconnectCleanup was NOT called because socket B is still active
    expect(cleanupSpy).not.toHaveBeenCalled();

    // Confirm user is still in Redis
    const userInRedis = await locationRedisRepository.getUserLocation(101);
    expect(userInRedis).toBeDefined();
    expect(userInRedis?.lat).toBeCloseTo(12.9716, 3);

    // Now disconnect socket B (last remaining socket)
    clientB.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    // Confirm scheduleDisconnectCleanup WAS called when last socket closed
    expect(cleanupSpy).toHaveBeenCalledWith(101);

    // Clean up
    locationService.cancelPendingDisconnect(101);
    await locationRedisRepository.removeUserLocation(101);
    cleanupSpy.mockRestore();
  });
});
