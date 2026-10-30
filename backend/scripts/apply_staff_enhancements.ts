import { pool } from '../src/config/database';

async function applyMigrations() {
  console.log('Applying staff qualifications and photo migration...');
  const conn = await pool.getConnection();

  try {
    await conn.query(`SET FOREIGN_KEY_CHECKS = 0;`);

    // 1. staff_qualifications table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`staff_qualifications\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
        \`staff_id\` BIGINT UNSIGNED NOT NULL COMMENT 'Owning staff member',
        \`qualification_level\` ENUM(
          'phd',
          'masters',
          'bachelors',
          'diploma',
          'certificate',
          'high_school',
          'other'
        ) NOT NULL COMMENT 'Award level',
        \`title\` VARCHAR(190) NOT NULL COMMENT 'Qualification title, e.g. BSc in Mathematics',
        \`institution\` VARCHAR(190) NOT NULL COMMENT 'Awarding institution',
        \`field_of_study\` VARCHAR(190) NULL COMMENT 'Field or major',
        \`award_date\` DATE NULL COMMENT 'Date the qualification was awarded',
        \`grade_or_class\` VARCHAR(60) NULL COMMENT 'Grade, class or result, e.g. Very Good / 3.7 GPA',
        \`registration_no\` VARCHAR(80) NULL COMMENT 'Certificate or registration number, when printed on the document',
        \`notes\` VARCHAR(500) NULL COMMENT 'Administrative notes',
        \`created_by\` BIGINT UNSIGNED NULL COMMENT 'User who recorded the qualification',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
        \`deleted_at\` DATETIME(3) NULL COMMENT 'Soft-delete time (UTC)',
        PRIMARY KEY (\`id\`),
        KEY \`ix_staff_qualifications_staff\` (\`staff_id\`, \`deleted_at\`),
        KEY \`ix_staff_qualifications_level\` (\`qualification_level\`),
        CONSTRAINT \`fk_staff_qualifications_staff\` FOREIGN KEY (\`staff_id\`) REFERENCES \`staff\` (\`id\`) ON DELETE CASCADE
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
    `);
    console.log('✅ Created or verified staff_qualifications table');

    // 2. qualification_documents table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`qualification_documents\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
        \`qualification_id\` BIGINT UNSIGNED NOT NULL COMMENT 'Owning qualification',
        \`document_id\` BIGINT UNSIGNED NOT NULL COMMENT 'The stored file metadata (documents.id)',
        \`verification_status\` ENUM(
          'pending',
          'verified',
          'rejected',
          'replaced'
        ) NOT NULL DEFAULT 'pending' COMMENT 'Review state',
        \`verified_by\` BIGINT UNSIGNED NULL COMMENT 'User who verified or rejected the document',
        \`verified_at\` DATETIME(3) NULL COMMENT 'Verification decision time (UTC)',
        \`verification_note\` VARCHAR(255) NULL COMMENT 'Reviewer note or rejection reason',
        \`replaced_by_id\` BIGINT UNSIGNED NULL COMMENT 'Newer qualification_documents row that replaced this one',
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = current document for the qualification',
        \`uploaded_by\` BIGINT UNSIGNED NOT NULL COMMENT 'User who uploaded the file',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_qualification_document\` (\`document_id\`),
        KEY \`ix_qualification_documents_qualification\` (\`qualification_id\`, \`is_active\`),
        KEY \`ix_qualification_documents_status\` (\`verification_status\`),
        CONSTRAINT \`fk_qualification_documents_qualification\` FOREIGN KEY (\`qualification_id\`) REFERENCES \`staff_qualifications\` (\`id\`) ON DELETE CASCADE
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
    `);
    console.log('✅ Created or verified qualification_documents table');

    // 3. staff.photo_document_id column
    const [cols]: any = await conn.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff' AND COLUMN_NAME = 'photo_document_id'
    `);
    if (cols.length === 0) {
      await conn.query(`
        ALTER TABLE \`staff\`
        ADD COLUMN \`photo_document_id\` BIGINT UNSIGNED NULL COMMENT 'Profile photo file' AFTER \`user_id\`
      `);
      console.log('✅ Added photo_document_id column to staff table');
    } else {
      console.log('ℹ️ photo_document_id column already exists on staff table');
    }

    // 4. Index & Foreign key on staff.photo_document_id
    const [keys]: any = await conn.query(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff' AND INDEX_NAME = 'ix_staff_photo_document'
    `);
    if (keys.length === 0) {
      await conn.query(`ALTER TABLE \`staff\` ADD KEY \`ix_staff_photo_document\` (\`photo_document_id\`)`);
      console.log('✅ Added index ix_staff_photo_document');
    }

    const [fks]: any = await conn.query(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff' AND CONSTRAINT_NAME = 'fk_staff_photo_document_id'
    `);
    if (fks.length === 0) {
      await conn.query(`
        ALTER TABLE \`staff\`
        ADD CONSTRAINT \`fk_staff_photo_document_id\`
        FOREIGN KEY (\`photo_document_id\`) REFERENCES \`documents\` (\`id\`)
      `);
      console.log('✅ Added foreign key fk_staff_photo_document_id');
    }

    await conn.query(`SET FOREIGN_KEY_CHECKS = 1;`);
    console.log('🎉 Migration completed successfully!');
  } finally {
    conn.release();
    await pool.end();
  }
}

applyMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
