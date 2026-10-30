import { pool } from '../../config/database';
import { PoolConnection } from 'mysql2/promise';

export interface CreateNotificationInput {
  userId: number;
  type: string;
  title: string;
  body?: string;
  payload?: any;
}

export class StudentNotificationService {
  static async send(input: CreateNotificationInput, conn?: PoolConnection): Promise<number> {
    const db = conn || pool;
    const [result]: any = await db.query(
      `INSERT INTO notifications (user_id, type, title, body, payload_json)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.type,
        input.title,
        input.body || null,
        input.payload ? JSON.stringify(input.payload) : null
      ]
    );
    return result.insertId;
  }
}
