import { pool } from '../src/config/database';
import { RowDataPacket } from 'mysql2/promise';

async function hasColumn(table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.columns 
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function hasIndex(table: string, indexName: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.statistics 
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, indexName]
  );
  return rows.length > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log('--- Applying Migration 20 (Parent & Guardian Portal) ---');

    // 1. student_guardians alterations
    const sgCols = [
      { col: 'can_view_results', def: 'TINYINT(1) NOT NULL DEFAULT 1 COMMENT "Allows viewing marks and report cards"' },
      { col: 'can_view_attendance', def: 'TINYINT(1) NOT NULL DEFAULT 1 COMMENT "Allows viewing attendance records and summaries"' },
      { col: 'can_view_fees', def: 'TINYINT(1) NOT NULL DEFAULT 1 COMMENT "Allows viewing invoices and payments"' },
      { col: 'can_message_staff', def: 'TINYINT(1) NOT NULL DEFAULT 1 COMMENT "Allows messaging assigned teachers"' },
      { col: 'status', def: "ENUM('pending', 'active', 'suspended', 'ended') NOT NULL DEFAULT 'active' COMMENT 'Link state'" },
      { col: 'verified_by', def: 'BIGINT UNSIGNED NULL COMMENT "Registrar who verified the relationship"' },
      { col: 'verified_at', def: 'DATETIME(3) NULL COMMENT "Verification timestamp"' },
      { col: 'ended_at', def: 'DATETIME(3) NULL COMMENT "When the link was closed"' },
      { col: 'ended_reason', def: 'VARCHAR(255) NULL COMMENT "Reason for closing or revoking access"' }
    ];

    for (const item of sgCols) {
      if (!(await hasColumn('student_guardians', item.col))) {
        console.log(`Adding student_guardians.${item.col}...`);
        await conn.query(`ALTER TABLE student_guardians ADD COLUMN ${item.col} ${item.def}`);
      } else {
        console.log(`student_guardians.${item.col} already exists.`);
      }
    }

    if (!(await hasIndex('student_guardians', 'ix_student_guardians_status'))) {
      console.log('Adding index ix_student_guardians_status...');
      await conn.query(`ALTER TABLE student_guardians ADD INDEX ix_student_guardians_status (status)`);
    }

    // 2. guardians alterations
    const gCols = [
      { col: 'phone_verified_at', def: 'DATETIME(3) NULL COMMENT "Mobile phone verification timestamp"' },
      { col: 'email_verified_at', def: 'DATETIME(3) NULL COMMENT "Email verification timestamp"' },
      { col: 'preferred_language', def: "VARCHAR(10) NOT NULL DEFAULT 'en' COMMENT 'en or am'" }
    ];

    for (const item of gCols) {
      if (!(await hasColumn('guardians', item.col))) {
        console.log(`Adding guardians.${item.col}...`);
        await conn.query(`ALTER TABLE guardians ADD COLUMN ${item.col} ${item.def}`);
      } else {
        console.log(`guardians.${item.col} already exists.`);
      }
    }

    // 3. guardian_invites table
    console.log('Creating guardian_invites table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS guardian_invites (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        student_id BIGINT UNSIGNED NOT NULL,
        guardian_id BIGINT UNSIGNED NULL,
        contact_phone VARCHAR(30) NOT NULL,
        relationship ENUM('mother','father','guardian','sibling','relative','other') NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        expires_at DATETIME(3) NOT NULL,
        used_at DATETIME(3) NULL,
        created_by BIGINT UNSIGNED NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX ix_invites_student (student_id),
        INDEX ix_invites_phone (contact_phone),
        INDEX ix_invites_expiry (expires_at),
        CONSTRAINT fk_invite_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
        CONSTRAINT fk_invite_guardian FOREIGN KEY (guardian_id) REFERENCES guardians (id) ON DELETE SET NULL,
        CONSTRAINT fk_invite_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Expiring onboarding invitations for parents'
    `);

    // 4. parent_requests & parent_request_replies
    console.log('Creating parent_requests table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS parent_requests (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        request_no VARCHAR(32) NOT NULL UNIQUE,
        guardian_id BIGINT UNSIGNED NOT NULL,
        student_id BIGINT UNSIGNED NULL,
        category ENUM('record_correction', 'fee_inquiry', 'bonafide_letter', 'meeting_request', 'general') NOT NULL,
        subject VARCHAR(190) NOT NULL,
        description TEXT NOT NULL,
        status ENUM('submitted', 'under_review', 'awaiting_information', 'resolved', 'rejected') NOT NULL DEFAULT 'submitted',
        assigned_role VARCHAR(40) NOT NULL DEFAULT 'registrar',
        due_at DATETIME(3) NULL,
        resolved_at DATETIME(3) NULL,
        resolved_by BIGINT UNSIGNED NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX ix_parent_req_guardian (guardian_id),
        INDEX ix_parent_req_student (student_id),
        INDEX ix_parent_req_status (status),
        INDEX ix_parent_req_category (category),
        CONSTRAINT fk_preq_guardian FOREIGN KEY (guardian_id) REFERENCES guardians (id) ON DELETE CASCADE,
        CONSTRAINT fk_preq_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE SET NULL,
        CONSTRAINT fk_preq_resolver FOREIGN KEY (resolved_by) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Parent formal requests and inquiries'
    `);

    console.log('Creating parent_request_replies table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS parent_request_replies (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        request_id BIGINT UNSIGNED NOT NULL,
        sender_user_id BIGINT UNSIGNED NOT NULL,
        sender_role ENUM('guardian', 'staff', 'admin') NOT NULL,
        reply_text TEXT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX ix_preq_reply_req (request_id),
        CONSTRAINT fk_preq_reply_request FOREIGN KEY (request_id) REFERENCES parent_requests (id) ON DELETE CASCADE,
        CONSTRAINT fk_preq_reply_user FOREIGN KEY (sender_user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Communication thread for parent requests'
    `);

    // 5. attendance_explanations
    console.log('Creating attendance_explanations table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS attendance_explanations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        attendance_record_id BIGINT UNSIGNED NOT NULL,
        guardian_id BIGINT UNSIGNED NOT NULL,
        student_id BIGINT UNSIGNED NOT NULL,
        reason TEXT NOT NULL,
        attachment_document_id BIGINT UNSIGNED NULL,
        status ENUM('submitted', 'accepted', 'declined') NOT NULL DEFAULT 'submitted',
        reviewed_by BIGINT UNSIGNED NULL,
        reviewed_at DATETIME(3) NULL,
        review_note VARCHAR(500) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_att_explanation (attendance_record_id, guardian_id),
        INDEX ix_att_exp_student (student_id),
        INDEX ix_att_exp_status (status),
        CONSTRAINT fk_atexp_record FOREIGN KEY (attendance_record_id) REFERENCES attendance_records (id) ON DELETE CASCADE,
        CONSTRAINT fk_atexp_guardian FOREIGN KEY (guardian_id) REFERENCES guardians (id) ON DELETE CASCADE,
        CONSTRAINT fk_atexp_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
        CONSTRAINT fk_atexp_doc FOREIGN KEY (attachment_document_id) REFERENCES documents (id) ON DELETE SET NULL,
        CONSTRAINT fk_atexp_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Parent absence explanations with staff review'
    `);

    // 6. parent_message_threads & messages
    console.log('Creating parent_message_threads table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS parent_message_threads (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        guardian_id BIGINT UNSIGNED NOT NULL,
        student_id BIGINT UNSIGNED NOT NULL,
        staff_id BIGINT UNSIGNED NOT NULL,
        subject VARCHAR(190) NOT NULL,
        status ENUM('active', 'archived', 'closed') NOT NULL DEFAULT 'active',
        last_message_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX ix_pm_thread_guardian (guardian_id),
        INDEX ix_pm_thread_staff (staff_id),
        INDEX ix_pm_thread_student (student_id),
        CONSTRAINT fk_pmt_guardian FOREIGN KEY (guardian_id) REFERENCES guardians (id) ON DELETE CASCADE,
        CONSTRAINT fk_pmt_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
        CONSTRAINT fk_pmt_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Conversations between guardian and child teachers'
    `);

    console.log('Creating parent_messages table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS parent_messages (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        thread_id BIGINT UNSIGNED NOT NULL,
        sender_user_id BIGINT UNSIGNED NOT NULL,
        body TEXT NOT NULL,
        read_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX ix_pm_thread_id (thread_id),
        CONSTRAINT fk_pm_thread FOREIGN KEY (thread_id) REFERENCES parent_message_threads (id) ON DELETE CASCADE,
        CONSTRAINT fk_pm_sender FOREIGN KEY (sender_user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Individual messages inside parent-teacher threads'
    `);

    // 7. guardian_dismissed_alerts
    console.log('Creating guardian_dismissed_alerts table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS guardian_dismissed_alerts (
        guardian_id BIGINT UNSIGNED NOT NULL,
        alert_key VARCHAR(120) NOT NULL,
        student_id BIGINT UNSIGNED NULL,
        dismissed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (guardian_id, alert_key),
        CONSTRAINT fk_gda_guardian FOREIGN KEY (guardian_id) REFERENCES guardians (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tracks dismissed attention alerts per guardian'
    `);

    // 8. system_settings seeds
    console.log('Seeding parent_portal system settings...');
    await conn.query(`
      INSERT INTO system_settings (setting_key, value_json, description, version, updated_at)
      VALUES
        ('parent_portal.enabled', 'true', 'Master switch for parent portal access', 1, NOW(3)),
        ('parent_portal.fees_enabled', 'true', 'Enables Page 11 Fees and Payments module', 1, NOW(3)),
        ('parent_portal.messaging_enabled', 'true', 'Enables bidirectional teacher messaging within working hours', 1, NOW(3)),
        ('parent_portal.meetings_enabled', 'true', 'Enables parent-teacher conference meeting booking', 1, NOW(3)),
        ('parent_portal.resources_enabled', 'true', 'Enables learning materials download for enrolled subjects', 1, NOW(3)),
        ('parent_portal.excuse_submission_enabled', 'true', 'Allows parents to submit explanations for student absences', 1, NOW(3)),
        ('parent_portal.show_class_position', 'true', 'Displays official report card class rank to parents', 1, NOW(3)),
        ('parent_portal.daily_message_limit', '5', 'Max messages a parent may send to staff per day', 1, NOW(3)),
        ('parent_portal.retention_read_only_days', '90', 'Days of read-only access after a child graduates or withdraws', 1, NOW(3)),
        ('attendance.minimum_acceptable_rate', '85.0', 'Minimum attendance rate threshold before attention alerts trigger', 1, NOW(3)),
        ('attendance.consecutive_absence_alert', '3', 'Consecutive absences triggering guardian attention alert', 1, NOW(3))
      ON DUPLICATE KEY UPDATE
        value_json = VALUES(value_json),
        description = VALUES(description),
        updated_at = NOW(3)
    `);

    console.log('✅ ALL MIGRATION 20 OPERATIONS COMPLETED SUCCESSFULLY!');
  } finally {
    conn.release();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ MIGRATION FAILED:', err);
    process.exit(1);
  });
