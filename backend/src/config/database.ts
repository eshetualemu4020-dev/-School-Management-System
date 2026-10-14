import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { env } from './env';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbConfig: mysql.PoolOptions = {
  host: env.MYSQL_SERVER,
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DB,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  decimalNumbers: true,
  dateStrings: true
};

export const pool = mysql.createPool(dbConfig);

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch (err) {
    console.error('MySQL connection failure:', err);
    return false;
  }
}

export default pool;
