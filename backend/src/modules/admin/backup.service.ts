import fs from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

export interface BackupRecord {
  id: number;
  file_name: string;
  file_path: string;
  size_bytes: number;
  type: 'manual' | 'scheduled' | 'pre_close';
  status: 'completed' | 'failed' | 'restoring';
  checksum: string | null;
  notes: string | null;
  created_by: number | null;
  created_by_username?: string;
  created_at: string;
}

export class BackupService {
  private backupDir: string;

  constructor() {
    this.backupDir = path.resolve(process.cwd(), 'storage', 'backups');
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Generates a complete, portable SQL database dump
   */
  async createBackup(
    userId: number,
    type: 'manual' | 'scheduled' | 'pre_close' = 'manual',
    notes?: string
  ): Promise<BackupRecord> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomSuffix = randomBytes(4).toString('hex');
    const fileName = `hspsms_backup_${type}_${timestamp}_${randomSuffix}.sql`;
    const filePath = path.join(this.backupDir, fileName);

    const writeStream = fs.createWriteStream(filePath, { encoding: 'utf8' });

    try {
      // Header and session environment setup
      writeStream.write(`-- HSPSMS ERP Database Snapshot\n`);
      writeStream.write(`-- Generated: ${new Date().toISOString()}\n`);
      writeStream.write(`-- Backup Type: ${type}\n\n`);
      writeStream.write(`SET FOREIGN_KEY_CHECKS = 0;\n`);
      writeStream.write(`SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n`);
      writeStream.write(`SET NAMES utf8mb4;\n\n`);

      // 1. Fetch all base tables in database
      const [tableRows] = await pool.query<RowDataPacket[]>(
        `SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'`
      );

      const tableNames: string[] = tableRows.map((r) => Object.values(r)[0] as string);

      for (const table of tableNames) {
        // Do not dump audit_logs or refresh_sessions to keep backup lightweight if desired,
        // but for full disaster recovery, we dump all tables!
        writeStream.write(`-- --------------------------------------------------------\n`);
        writeStream.write(`-- Table structure and data for table \`${table}\`\n`);
        writeStream.write(`-- --------------------------------------------------------\n`);
        writeStream.write(`DROP TABLE IF EXISTS \`${table}\`;\n`);

        const [createRows] = await pool.query<RowDataPacket[]>(`SHOW CREATE TABLE \`${table}\``);
        if (createRows.length > 0) {
          const createStmt = createRows[0]['Create Table'] as string;
          writeStream.write(`${createStmt};\n\n`);
        }

        // Dump table data in batches of 200 rows
        let offset = 0;
        const batchSize = 200;
        let hasRows = true;

        while (hasRows) {
          const [dataRows] = await pool.query<RowDataPacket[]>(
            `SELECT * FROM \`${table}\` LIMIT ${batchSize} OFFSET ${offset}`
          );

          if (dataRows.length === 0) {
            hasRows = false;
            break;
          }

          const columns = Object.keys(dataRows[0]);
          const colList = columns.map((c) => `\`${c}\``).join(', ');

          const valueStrings = dataRows.map((row) => {
            const formatted = columns.map((col) => {
              const val = row[col];
              if (val === null || val === undefined) return 'NULL';
              if (typeof val === 'number') return String(val);
              if (typeof val === 'boolean') return val ? '1' : '0';
              if (val instanceof Date) return pool.escape(val.toISOString().slice(0, 23).replace('T', ' '));
              if (typeof val === 'object') return pool.escape(JSON.stringify(val));
              return pool.escape(String(val));
            });
            return `(${formatted.join(', ')})`;
          });

          writeStream.write(`INSERT INTO \`${table}\` (${colList}) VALUES\n  ${valueStrings.join(',\n  ')};\n\n`);
          offset += dataRows.length;

          if (dataRows.length < batchSize) {
            hasRows = false;
          }
        }
      }

      // Re-enable foreign key checks at end of dump
      writeStream.write(`SET FOREIGN_KEY_CHECKS = 1;\n`);
      writeStream.write(`-- End of Backup Dump\n`);
      await new Promise((resolve, reject) => {
        writeStream.end(resolve);
        writeStream.on('error', reject);
      });

      // Calculate file size and SHA-256 checksum
      const stats = fs.statSync(filePath);
      const fileBuffer = fs.readFileSync(filePath);
      const checksum = createHash('sha256').update(fileBuffer).digest('hex');

      // Record in database
      const [insertResult] = await pool.query<any>(
        `INSERT INTO backups (file_name, file_path, size_bytes, type, status, checksum, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, NOW(3))`,
        [fileName, filePath, stats.size, type, checksum, notes || null, userId]
      );

      const backupId = insertResult.insertId;

      // Audit log
      await pool.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(3), ?, 'admin', 'backup.create', 'backups', ?, 'success', ?, ?)`,
        [
          userId,
          backupId,
          JSON.stringify({ fileName, sizeBytes: stats.size, type, checksum }),
          notes || `Manual database snapshot generated`
        ]
      );

      return {
        id: backupId,
        file_name: fileName,
        file_path: filePath,
        size_bytes: stats.size,
        type,
        status: 'completed',
        checksum,
        notes: notes || null,
        created_by: userId,
        created_at: new Date().toISOString()
      };
    } catch (err: any) {
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
      throw new AppError(`Failed to create database backup: ${err.message}`, 500, 'BACKUP_CREATION_FAILED');
    }
  }

  /**
   * Returns list of all available backup snapshots
   */
  async getBackups(): Promise<BackupRecord[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT b.*, u.username as created_by_username
       FROM backups b
       LEFT JOIN users u ON u.id = b.created_by
       ORDER BY b.created_at DESC`
    );
    return rows as BackupRecord[];
  }

  /**
   * Retrieves single backup record by ID
   */
  async getBackupById(id: number): Promise<BackupRecord> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT b.*, u.username as created_by_username
       FROM backups b
       LEFT JOIN users u ON u.id = b.created_by
       WHERE b.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      throw new AppError('Backup record not found.', 404, 'BACKUP_NOT_FOUND');
    }

    return rows[0] as BackupRecord;
  }

  /**
   * Verifies disk file existence and cryptographic SHA-256 integrity
   */
  async verifyChecksum(id: number): Promise<{
    valid: boolean;
    storedChecksum: string | null;
    calculatedChecksum: string;
    sizeBytes: number;
    verifiedAt: string;
  }> {
    const backup = await this.getBackupById(id);

    if (!fs.existsSync(backup.file_path)) {
      throw new AppError('Backup file does not exist on disk.', 404, 'BACKUP_FILE_MISSING');
    }

    const fileBuffer = fs.readFileSync(backup.file_path);
    const calculatedChecksum = createHash('sha256').update(fileBuffer).digest('hex');
    const valid = backup.checksum === calculatedChecksum;

    return {
      valid,
      storedChecksum: backup.checksum,
      calculatedChecksum,
      sizeBytes: fileBuffer.length,
      verifiedAt: new Date().toISOString()
    };
  }

  /**
   * Restores database from a selected backup snapshot with safety safeguards
   */
  async restoreBackup(
    id: number,
    userId: number,
    confirmationWord: string
  ): Promise<{ success: boolean; message: string }> {
    if (confirmationWord !== 'RESTORE-DATABASE') {
      throw new AppError(
        'Confirmation word mismatch. You must type "RESTORE-DATABASE" to confirm database restoration.',
        400,
        'RESTORE_CONFIRMATION_INVALID'
      );
    }

    const backup = await this.getBackupById(id);

    if (!fs.existsSync(backup.file_path)) {
      throw new AppError('Backup file cannot be found on storage disk.', 404, 'BACKUP_FILE_MISSING');
    }

    // Cryptographic verification before execution
    const verify = await this.verifyChecksum(id);
    if (!verify.valid) {
      throw new AppError(
        'Backup verification failed: SHA-256 checksum does not match recorded value. Refusing to restore corrupted file.',
        422,
        'BACKUP_CHECKSUM_MISMATCH'
      );
    }

    // Put system in maintenance mode
    await pool.query(
      `UPDATE system_settings SET value_json = CAST('true' AS JSON) WHERE setting_key = 'system.maintenance_mode'`
    );

    try {
      const sqlContent = fs.readFileSync(backup.file_path, 'utf8');

      // Execute SQL content with foreign keys toggled
      const conn = await pool.getConnection();
      try {
        await conn.query(`SET FOREIGN_KEY_CHECKS = 0`);

        // Parse individual statements
        const statements = sqlContent
          .split(/;\s*[\r\n]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith('--'));

        for (const stmt of statements) {
          await conn.query(stmt);
        }

        await conn.query(`SET FOREIGN_KEY_CHECKS = 1`);
      } finally {
        conn.release();
      }

      // Record successful restore audit log
      await pool.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(3), ?, 'admin', 'backup.restore', 'backups', ?, 'success', ?, 'Full database restoration executed')`,
        [userId, id, JSON.stringify({ fileName: backup.file_name, checksum: backup.checksum })]
      );

      return {
        success: true,
        message: `Database successfully restored from snapshot ${backup.file_name}.`
      };
    } catch (err: any) {
      // Record failure audit log
      await pool.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
         VALUES (NOW(3), ?, 'admin', 'backup.restore', 'backups', ?, 'failure', ?)`,
        [userId, id, `Restore failed: ${err.message}`]
      );
      throw new AppError(`Database restore failed: ${err.message}`, 500, 'RESTORE_EXECUTION_ERROR');
    } finally {
      // Always lift maintenance mode after restore attempt
      await pool.query(
        `UPDATE system_settings SET value_json = CAST('false' AS JSON) WHERE setting_key = 'system.maintenance_mode'`
      );
    }
  }

  /**
   * Deletes a backup snapshot from both database and disk
   */
  async deleteBackup(id: number, userId: number): Promise<void> {
    const backup = await this.getBackupById(id);

    if (fs.existsSync(backup.file_path)) {
      try {
        fs.unlinkSync(backup.file_path);
      } catch (err) {
        console.error(`Warning: could not delete backup file ${backup.file_path}:`, err);
      }
    }

    await pool.query(`DELETE FROM backups WHERE id = ?`, [id]);

    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
       VALUES (NOW(3), ?, 'admin', 'backup.delete', 'backups', ?, 'success', ?, 'Backup file removed')`,
      [userId, id, JSON.stringify(backup)]
    );
  }

  /**
   * Prunes scheduled backups exceeding the retention policy
   */
  async pruneExpiredBackups(): Promise<number> {
    try {
      const [settingRows] = await pool.query<RowDataPacket[]>(
        `SELECT value_json FROM system_settings WHERE setting_key = 'backup.retention_daily'`
      );
      const retentionDays = Number(settingRows[0]?.value_json) || 30;

      const [expiredRows] = await pool.query<RowDataPacket[]>(
        `SELECT id, file_path FROM backups
         WHERE type = 'scheduled'
           AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [retentionDays]
      );

      let count = 0;
      for (const row of expiredRows) {
        if (fs.existsSync(row.file_path)) {
          try { fs.unlinkSync(row.file_path); } catch {}
        }
        await pool.query(`DELETE FROM backups WHERE id = ?`, [row.id]);
        count++;
      }

      return count;
    } catch {
      return 0;
    }
  }
}
