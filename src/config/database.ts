import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { env } from './env.js';

const isProduction = env.nodeEnv === 'production';
const hasExplicitSsl = env.dbSsl;
const isNeonOrSslUrl = Boolean(
  env.databaseUrl &&
    (env.databaseUrl.includes('sslmode=require') ||
      env.databaseUrl.includes('neon.tech') ||
      env.databaseUrl.includes('ssl=true'))
);
const shouldUseSsl = hasExplicitSsl || isNeonOrSslUrl || (isProduction && Boolean(env.databaseUrl));

if (env.nodeEnv === 'test') {
  if (env.databaseUrl) {
    const isUrlLocal = /localhost|127\.0\.0\.1|::1/i.test(env.databaseUrl);
    if (!isUrlLocal) {
      throw new Error(`[SAFETY] Database refused to start: non-local databaseUrl under NODE_ENV=test`);
    }
  } else {
    const isDbLocal = /localhost|127\.0\.0\.1|::1/i.test(env.dbHost);
    if (!isDbLocal) {
      throw new Error(`[SAFETY] Database refused to start: non-local host '${env.dbHost}' under NODE_ENV=test`);
    }
    const devDb = process.env.DB_NAME || process.env.DATABASE || 'roadlife';
    if (env.database === devDb) {
      throw new Error(
        `[SAFETY] Database refused to start: test database name '${env.database}' cannot equal development database '${devDb}' under NODE_ENV=test. Set TEST_DB_NAME to a separate test database.`
      );
    }
  }
}

export const pool = new Pool(
  env.databaseUrl
    ? {
        connectionString: env.databaseUrl,
        ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: env.dbHost,
        port: env.dbPort,
        user: env.dbUser,
        password: env.dbPassword,
        database: env.database,
        ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
      }
);

export const query = async <T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> => {
  return pool.query<T>(text, params);
};

export const connectDB = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('✅ PostgreSQL connected successfully at:', result.rows[0].now);
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error);
  }
};

export default pool;
