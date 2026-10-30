import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../config/database';

export interface SystemDiagnostics {
  database: {
    status?: string;
    connected: boolean;
    databaseName: string;
    latencyMs: number;
    version: string;
    threadsConnected: number;
    maxConnections: number;
    uptimeSeconds: number;
  };
  storage: {
    dbSizeMb: number;
    tableCount: number;
    backupCount: number;
    backupStorageMb: number;
  };
  lastBackup: {
    id: number;
    fileName: string;
    sizeBytes: number;
    type: string;
    status: string;
    createdAt: string;
  } | null;
  recentErrors: {
    failedAuditsLast24h: number;
    failedLoginsLast24h: number;
  };
  system: {
    nodeVersion: string;
    platform: string;
    arch: string;
    processUptimeSeconds: number;
    memoryUsageMb: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
    };
  };
  app: {
    name: string;
    version: string;
    environment: string;
    maintenanceMode: boolean;
  };
}

export class DiagnosticsService {
  /**
   * Aggregates live system health metrics, storage consumption, and runtime diagnostics
   */
  async getDiagnostics(): Promise<SystemDiagnostics> {
    // 1. Database Connectivity & Latency Ping
    const startTime = Date.now();
    const conn = await pool.getConnection();
    let latencyMs = 0;
    let version = '';
    let databaseName = '';
    let threadsConnected = 0;
    let maxConnections = 0;
    let dbUptimeSeconds = 0;

    try {
      await conn.ping();
      latencyMs = Date.now() - startTime;

      const [verRows] = await conn.query<RowDataPacket[]>('SELECT VERSION() as v');
      if (verRows.length > 0) version = verRows[0].v;
      const [databaseRows] = await conn.query<RowDataPacket[]>('SELECT DATABASE() AS databaseName');
      if (databaseRows.length > 0) databaseName = String(databaseRows[0].databaseName || '');

      const [statusRows] = await conn.query<RowDataPacket[]>(
        "SHOW STATUS WHERE Variable_name IN ('Threads_connected', 'Uptime')"
      );
      for (const row of statusRows) {
        if (row.Variable_name === 'Threads_connected') threadsConnected = Number(row.Value) || 0;
        if (row.Variable_name === 'Uptime') dbUptimeSeconds = Number(row.Value) || 0;
      }

      const [varRows] = await conn.query<RowDataPacket[]>(
        "SHOW VARIABLES LIKE 'max_connections'"
      );
      if (varRows.length > 0) maxConnections = Number(varRows[0].Value) || 0;
    } finally {
      conn.release();
    }

    // 2. Storage Metrics (Database Size + Backup Disk Footprint)
    const [sizeRows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        COUNT(*) as tableCount,
        ROUND(COALESCE(SUM(data_length + index_length), 0) / (1024 * 1024), 2) as dbSizeMb
      FROM information_schema.TABLES
      WHERE table_schema = DATABASE()
    `);

    const tableCount = Number(sizeRows[0]?.tableCount || 0);
    const dbSizeMb = Number(sizeRows[0]?.dbSizeMb || 0);

    // Backup Storage Footprint
    const backupDir = path.resolve(process.cwd(), 'storage', 'backups');
    let backupCount = 0;
    let backupStorageBytes = 0;

    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir);
      backupCount = files.length;
      for (const f of files) {
        try {
          const stats = fs.statSync(path.join(backupDir, f));
          backupStorageBytes += stats.size;
        } catch {}
      }
    }

    const backupStorageMb = Math.round((backupStorageBytes / (1024 * 1024)) * 100) / 100;

    // 3. Last Successful Backup
    const [lastBackupRows] = await pool.query<RowDataPacket[]>(`
      SELECT id, file_name, size_bytes, type, status, created_at
      FROM backups
      WHERE status = 'completed'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const lastBackup = lastBackupRows.length > 0 ? {
      id: lastBackupRows[0].id,
      fileName: lastBackupRows[0].file_name,
      sizeBytes: Number(lastBackupRows[0].size_bytes),
      type: lastBackupRows[0].type,
      status: lastBackupRows[0].status,
      createdAt: lastBackupRows[0].created_at
    } : null;

    // 4. Recent Errors Count (Last 24 Hours)
    const [failedAuditRows] = await pool.query<RowDataPacket[]>(`
      SELECT COUNT(*) as cnt
      FROM audit_logs
      WHERE outcome = 'failure'
        AND occurred_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);
    const failedAuditsLast24h = Number(failedAuditRows[0]?.cnt || 0);

    const [failedLoginRows] = await pool.query<RowDataPacket[]>(`
      SELECT COUNT(*) as cnt
      FROM login_attempts
      WHERE success = 0
        AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);
    const failedLoginsLast24h = Number(failedLoginRows[0]?.cnt || 0);

    // 5. System Runtime & Memory Usage
    const mem = process.memoryUsage();
    const memoryUsageMb = {
      rss: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
      heapUsed: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
      heapTotal: Math.round((mem.heapTotal / (1024 * 1024)) * 10) / 10
    };

    // 6. Maintenance Mode Status
    const [maintRows] = await pool.query<RowDataPacket[]>(`
      SELECT value_json FROM system_settings WHERE setting_key = 'system.maintenance_mode'
    `);
    const maintenanceMode = maintRows[0]?.value_json === 'true' || maintRows[0]?.value_json === true;

    return {
      database: {
        status: 'connected',
        connected: true,
        databaseName,
        latencyMs,
        version,
        threadsConnected,
        maxConnections,
        uptimeSeconds: dbUptimeSeconds
      },
      storage: {
        dbSizeMb,
        tableCount,
        backupCount,
        backupStorageMb
      },
      lastBackup,
      recentErrors: {
        failedAuditsLast24h,
        failedLoginsLast24h
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        processUptimeSeconds: Math.floor(process.uptime()),
        memoryUsageMb
      },
      app: {
        name: 'Ketema Nigus Secondary & Preparatory ERP',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'production',
        maintenanceMode
      }
    };
  }
}
