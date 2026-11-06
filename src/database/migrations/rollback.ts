import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../../config/database.js';

export const rollbackLastMigration = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ id: number; migration_name: string }>(
      'SELECT id, migration_name FROM schema_migrations ORDER BY id DESC LIMIT 1'
    );

    if (rows.length === 0) {
      console.log('ℹ️  No migrations found to rollback.');
      return;
    }

    const lastMigration = rows[0];
    console.log(`⚠️ Rolling back migration record: ${lastMigration.migration_name}`);

    const dir = path.dirname(fileURLToPath(import.meta.url));
    const downFileName = lastMigration.migration_name.replace(/\.sql$/, '.down.sql');
    const downFilePath = path.join(dir, downFileName);

    if (!fs.existsSync(downFilePath)) {
      throw new Error(
        `Cannot rollback ${lastMigration.migration_name}: down migration file '${downFileName}' does not exist. Aborting rollback without modifying schema_migrations.`
      );
    }

    const downSql = fs.readFileSync(downFilePath, 'utf-8');
    console.log(`⚡ Executing down migration: ${downFileName}`);
    await client.query(downSql);

    await client.query('DELETE FROM schema_migrations WHERE id = $1', [lastMigration.id]);
    console.log(`✅ Removed record for: ${lastMigration.migration_name}`);
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    process.exitCode = 1;
    throw error;
  } finally {
    client.release();
  }
};

const isMain = () => {
  if (!process.argv[1]) return false;
  const current = fileURLToPath(import.meta.url).toLowerCase();
  const argv = path.resolve(process.argv[1]).toLowerCase();
  return argv === current || argv.endsWith('rollback.ts') || argv.endsWith('rollback.js');
};

if (isMain()) {
  rollbackLastMigration()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
}
