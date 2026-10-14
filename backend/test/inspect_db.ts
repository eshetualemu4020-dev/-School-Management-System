import { pool } from '../src/config/database';

async function describeTables() {
  const tables = [
    'books',
    'book_copies',
    'library_loans',
    'library_reservations',
    'guardians',
    'student_guardians',
    'transfers_withdrawals',
    'documents',
    'invoices',
    'invoice_items',
    'payments',
    'audit_logs',
    'assignments',
    'submissions',
    'report_card_snapshots'
  ];

  for (const t of tables) {
    try {
      const [cols] = await pool.query(`DESCRIBE ${t}`);
      console.log(`=== ${t} ===`);
      console.log((cols as any[]).map(c => `${c.Field} (${c.Type}, Null:${c.Null})`).join(', '));
    } catch (e: any) {
      console.log(`=== ${t} === ERROR: ${e.message}`);
    }
  }
  await pool.end();
}

describeTables();
