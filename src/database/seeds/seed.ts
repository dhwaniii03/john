import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runSeeds = async () => {
  try {
    let seedsPath = __dirname;
    if (
      !fs.existsSync(seedsPath) ||
      !fs.readdirSync(seedsPath).some((file) => file.endsWith('.sql'))
    ) {
      const fallbackPath = path.resolve(process.cwd(), 'src/database/seeds');
      if (fs.existsSync(fallbackPath)) {
        seedsPath = fallbackPath;
      }
    }

    const files = fs
      .readdirSync(seedsPath)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      console.log(`Running seed: ${file}`);

      const sql = fs.readFileSync(path.join(seedsPath, file), 'utf-8');

      await pool.query(sql);

      console.log(`✅ Completed: ${file}`);
    }

    console.log('✅ All seeds executed successfully');

    await pool.end();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

runSeeds();
