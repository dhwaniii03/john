import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const runMigrations = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    // 1. Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Fetch already executed migrations
    const { rows: executedRows } = await client.query<{ migration_name: string }>(
      'SELECT migration_name FROM schema_migrations ORDER BY id ASC'
    );
    const executedMigrations = new Set(executedRows.map((r) => r.migration_name));

    let migrationsPath = __dirname;
    if (
      !fs.existsSync(migrationsPath) ||
      !fs.readdirSync(migrationsPath).some((file) => file.endsWith('.sql'))
    ) {
      const fallbackPath = path.resolve(process.cwd(), 'src/database/migrations');
      if (fs.existsSync(fallbackPath)) {
        migrationsPath = fallbackPath;
      }
    }

    const files = fs
      .readdirSync(migrationsPath)
      .filter((file) => file.endsWith('.sql') && !file.endsWith('.down.sql'))
      .sort();

    // Verify no duplicate numeric prefixes exist across migration files
    const prefixMap = new Map<string, string>();
    for (const file of files) {
      const match = file.match(/^(\d+)_/);
      if (match) {
        const prefix = match[1];
        if (prefixMap.has(prefix)) {
          const conflict = prefixMap.get(prefix)!;
          throw new Error(
            `Duplicate migration numeric prefix detected: '${prefix}' is shared by '${conflict}' and '${file}'. Aborting migrations.`
          );
        }
        prefixMap.set(prefix, file);
      }
    }

    let executedCount = 0;

    for (const file of files) {
      if (executedMigrations.has(file)) {
        continue;
      }

      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsPath, file), 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (migration_name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ Completed migration: ${file}`);
        executedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Failed migration: ${file}`, err);
        throw err;
      }
    }

    if (executedCount === 0) {
      console.log('ℹ️  No pending migrations. Database schema is up to date.');
    } else {
      console.log(`✅ ${executedCount} migration(s) executed successfully.`);
    }
  } catch (error) {
    console.error('❌ Migration process failed:', error);
    process.exitCode = 1;
    throw error;
  } finally {
    client.release();
  }
};

// Auto-run if executed directly
const isMain = () => {
  if (!process.argv[1]) return false;
  const current = fileURLToPath(import.meta.url).toLowerCase();
  const argv = path.resolve(process.argv[1]).toLowerCase();
  return argv === current || argv.endsWith('migrate.ts') || argv.endsWith('migrate.js');
};

if (isMain()) {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
}
