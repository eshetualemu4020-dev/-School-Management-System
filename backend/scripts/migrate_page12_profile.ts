import { pool } from '../src/config/database';

/**
 * Migration 19 (Page 12: My Profile) — additive only.
 *
 * Adds the indexes used by the profile, profile-photo and correction-request
 * read paths. Every statement checks information_schema first so the migration
 * is safe to run repeatedly and never touches existing data.
 *
 * Run: npx ts-node scripts/migrate_page12_profile.ts
 */

interface IndexPlan {
  table: string;
  index: string;
  columns: string;
}

const INDEXES: IndexPlan[] = [
  {
    table: 'student_requests',
    index: 'idx_requests_student_type_status',
    columns: '(`student_id`, `request_type`, `status`)'
  },
  {
    table: 'documents',
    index: 'idx_documents_owner_type',
    columns: '(`owner_type`, `owner_id`, `doc_type`, `deleted_at`)'
  },
  {
    table: 'student_requests',
    index: 'idx_requests_correction_field',
    columns: '(`student_id`, `correction_field`, `status`)'
  }
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const plan of INDEXES) {
    const [rows]: any = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [plan.table, plan.index]
    );
    if (Number(rows[0].n) > 0) {
      console.log(`SKIP  ${plan.table}.${plan.index} (already present)`);
      skipped++;
      continue;
    }
    await pool.query(`ALTER TABLE \`${plan.table}\` ADD INDEX \`${plan.index}\` ${plan.columns}`);
    console.log(`ADDED ${plan.table}.${plan.index}`);
    created++;
  }

  console.log(`\nMigration 19 complete: ${created} index(es) created, ${skipped} already present.`);
  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Migration 19 failed:', err.message);
  try {
    await pool.end();
  } catch {
    /* already closed */
  }
  process.exit(1);
});
