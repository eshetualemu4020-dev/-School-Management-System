import fs from 'fs';
import path from 'path';
import { pool } from '../src/config/database';

async function main() {
  const migrationPath = process.argv[2] 
    ? path.resolve(process.argv[2]) 
    : path.resolve(__dirname, '../../sql/migrations/08_package3_approvals.sql');

  console.log(`Applying migration from: ${migrationPath}`);
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Strip single-line comments (-- ...) and block comments (/* ... */)
  const cleanedSql = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  const statements = cleanedSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    console.log(`Executing statement:\n${statement.substring(0, 100)}...`);
    await pool.query(statement);
  }

  console.log('Migration successfully applied!');
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
