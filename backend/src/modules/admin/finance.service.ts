import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

export interface FinanceOverview {
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
  collectionRate: number;
  byMethod: Array<{ method: string; total: number; count: number }>;
  byStatus: Array<{ status: string; total: number; count: number }>;
  recentPayments: any[];
}

export class FinanceService {
  /**
   * Executive Overview & Financial Metrics
   */
  async getOverview(): Promise<FinanceOverview> {
    // Total Invoiced (non-void invoices)
    const [invSumRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(ii.line_total), 0) AS totalInvoiced
       FROM invoice_items ii
       JOIN invoices i ON ii.invoice_id = i.id
       WHERE i.status != 'void'`
    );
    const totalInvoiced = Number(invSumRows[0]?.totalInvoiced || 0);

    // Total Collected (posted payments)
    const [paySumRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount), 0) AS totalCollected
       FROM payments
       WHERE status = 'posted'`
    );
    const totalCollected = Number(paySumRows[0]?.totalCollected || 0);

    const outstandingBalance = Math.max(0, totalInvoiced - totalCollected);
    const collectionRate = totalInvoiced > 0 ? Math.min(100, Math.round((totalCollected / totalInvoiced) * 100)) : 100;

    // Breakdown by payment method
    const [methodRows] = await pool.query<RowDataPacket[]>(
      `SELECT method, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM payments
       WHERE status = 'posted'
       GROUP BY method`
    );
    const byMethod = methodRows.map((r) => ({
      method: r.method,
      total: Number(r.total),
      count: Number(r.count)
    }));

    // Invoices breakdown by status
    const [statusRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        i.status,
        COUNT(DISTINCT i.id) AS count,
        COALESCE(SUM(ii.line_total), 0) AS total
       FROM invoices i
       LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
       GROUP BY i.status`
    );
    const byStatus = statusRows.map((r) => ({
      status: r.status,
      count: Number(r.count),
      total: Number(r.total)
    }));

    // Recent 5 payments
    const [recentRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        p.id,
        p.receipt_no,
        p.student_id,
        CONCAT(s.first_name, ' ', s.father_name) AS student_name,
        s.admission_no,
        p.amount,
        p.currency,
        p.method,
        p.reference,
        p.payer_name,
        p.received_at,
        p.status
       FROM payments p
       JOIN students s ON p.student_id = s.id
       ORDER BY p.received_at DESC, p.id DESC
       LIMIT 5`
    );

    return {
      totalInvoiced,
      totalCollected,
      outstandingBalance,
      collectionRate,
      byMethod,
      byStatus,
      recentPayments: recentRows
    };
  }

  /**
   * Fee Categories
   */
  async getFeeCategories(): Promise<any[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, code, name, is_recurring, status, created_at FROM fee_categories ORDER BY id ASC`
    );
    return rows;
  }

  async createFeeCategory(data: { code: string; name: string; isRecurring?: boolean }, userId: number, username: string): Promise<any> {
    const code = String(data.code || '').trim().toLowerCase();
    const name = String(data.name || '').trim();
    if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(code) || !name || name.length > 100) {
      throw new AppError('Provide a category code (2–40 letters, numbers, hyphens or underscores) and a name up to 100 characters.', 400, 'INVALID_FEE_CATEGORY');
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [existing] = await conn.query<RowDataPacket[]>(`SELECT id FROM fee_categories WHERE code = ? LIMIT 1`, [code]);
      if (existing.length) throw new AppError('A fee category with this code already exists.', 409, 'DUPLICATE_FEE_CATEGORY');
      const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO fee_categories (code, name, is_recurring, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', NOW(3), NOW(3))`,
        [code, name, data.isRecurring ? 1 : 0]
      );
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(3), ?, ?, 'FEE_CATEGORY_CREATE', 'fee_categories', ?, 'success', ?, 'Fee category created by administrator')`,
        [userId, username, String(result.insertId), JSON.stringify({ code, name, isRecurring: Boolean(data.isRecurring) })]
      );
      await conn.commit();
      return { id: result.insertId, message: 'Fee category created' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Fee Structures
   */
  async getFeeStructures(academicYearId?: number): Promise<any[]> {
    let sql = `
      SELECT 
        fs.id,
        fs.academic_year_id,
        ay.name AS academic_year_name,
        fs.grade_id,
        g.display_name AS grade_name,
        fs.fee_category_id,
        fc.name AS category_name,
        fc.code AS category_code,
        fs.eligibility,
        fs.amount,
        fs.currency,
        fs.due_date,
        fs.due_rule,
        fs.is_active,
        fs.created_at
      FROM fee_structures fs
      JOIN fee_categories fc ON fs.fee_category_id = fc.id
      LEFT JOIN grades g ON fs.grade_id = g.id
      LEFT JOIN academic_years ay ON fs.academic_year_id = ay.id
    `;
    const params: any[] = [];
    if (academicYearId) {
      sql += ' WHERE fs.academic_year_id = ?';
      params.push(academicYearId);
    }
    sql += ' ORDER BY fs.id DESC';

    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async createFeeStructure(
    data: {
      academic_year_id: number;
      grade_id?: number | null;
      fee_category_id: number;
      amount: number;
      due_date?: string;
    },
    userId: number
  ): Promise<any> {
    if (!data.fee_category_id || Number(data.amount) <= 0) {
      throw new AppError('Fee category and valid amount are required', 400, 'INVALID_PARAMS');
    }

    let yearId = Number(data.academic_year_id);
    const [yearRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM academic_years WHERE id = ?`,
      [yearId]
    );
    if (yearRows.length === 0) {
      const [activeYear] = await pool.query<RowDataPacket[]>(
        `SELECT id FROM academic_years WHERE is_current = 1 OR status = 'active' ORDER BY is_current DESC, id ASC LIMIT 1`
      );
      if (!activeYear.length) throw new AppError('Create and activate an academic year before configuring fee schedules.', 400, 'ACTIVE_ACADEMIC_YEAR_REQUIRED');
      yearId = Number(activeYear[0].id);
    }

    let gradeId = data.grade_id ? Number(data.grade_id) : null;
    if (gradeId) {
      const [gradeRows] = await pool.query<RowDataPacket[]>(`SELECT id FROM grades WHERE id = ? AND is_active = 1 LIMIT 1`, [gradeId]);
      if (!gradeRows.length) throw new AppError('Selected grade does not exist or is inactive.', 400, 'INVALID_FEE_GRADE');
    }

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO fee_structures (
        academic_year_id, grade_id, fee_category_id, eligibility, amount, currency,
        due_date, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, 'all', ?, 'ETB', ?, 1, NOW(3), NOW(3))`,
      [
        yearId,
        gradeId,
        data.fee_category_id,
        data.amount,
        data.due_date || null
      ]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
       VALUES (NOW(3), ?, 'admin', 'finance.fee_structure_created', 'fee_structures', ?, 'success', ?)`,
      [userId, result.insertId, `Created fee structure amount ETB ${data.amount}`]
    );

    return { id: result.insertId, message: 'Fee structure created successfully' };
  }

  /**
   * Invoices List & Filtering
   */
  async getInvoices(filters: {
    status?: string;
    search?: string;
    studentId?: number;
    page?: number;
    limit?: number;
  } = {}): Promise<{ items: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    if (filters.status && filters.status !== 'all') {
      whereClauses.push('i.status = ?');
      params.push(filters.status);
    }

    if (filters.studentId) {
      whereClauses.push('i.student_id = ?');
      params.push(filters.studentId);
    }

    if (filters.search) {
      whereClauses.push('(i.invoice_no LIKE ? OR s.admission_no LIKE ? OR s.first_name LIKE ? OR s.father_name LIKE ?)');
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term, term);
    }

    const whereSql = whereClauses.join(' AND ');

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT i.id) AS total
       FROM invoices i
       JOIN students s ON i.student_id = s.id
       WHERE ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        i.id,
        i.invoice_no,
        i.student_id,
        CONCAT(s.first_name, ' ', s.father_name) AS student_name,
        s.admission_no,
        (
          SELECT g.display_name 
          FROM enrollments e 
          JOIN sections sec ON e.section_id = sec.id 
          JOIN grades g ON sec.grade_id = g.id 
          WHERE e.student_id = s.id 
          ORDER BY e.id DESC LIMIT 1
        ) AS grade_name,
        (
          SELECT sec.name 
          FROM enrollments e 
          JOIN sections sec ON e.section_id = sec.id 
          WHERE e.student_id = s.id 
          ORDER BY e.id DESC LIMIT 1
        ) AS section_name,
        i.academic_year_id,
        (SELECT ay.name FROM academic_years ay WHERE ay.id = i.academic_year_id) AS academic_year_name,
        i.issue_date,
        i.due_date,
        i.currency,
        i.status,
        i.notes,
        COALESCE((SELECT SUM(ii.line_total) FROM invoice_items ii WHERE ii.invoice_id = i.id), 0) AS total_amount,
        COALESCE((
          SELECT SUM(pa.allocated_amount)
          FROM payment_allocations pa
          JOIN payments p ON pa.payment_id = p.id
          WHERE pa.invoice_id = i.id AND p.status = 'posted'
        ), 0) AS paid_amount,
        i.created_at
      FROM invoices i
      JOIN students s ON i.student_id = s.id
      WHERE ${whereSql}
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const items = rows.map((r) => {
      const totalAmount = Number(r.total_amount);
      const paidAmount = Number(r.paid_amount);
      const balance = Math.max(0, totalAmount - paidAmount);
      return {
        id: r.id,
        invoice_no: r.invoice_no,
        student_id: r.student_id,
        student_name: r.student_name,
        admission_no: r.admission_no,
        grade_name: r.grade_name || 'N/A',
        section_name: r.section_name || 'N/A',
        academic_year_name: r.academic_year_name || 'N/A',
        issue_date: r.issue_date,
        due_date: r.due_date,
        currency: r.currency,
        status: r.status,
        notes: r.notes,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        balance,
        created_at: r.created_at
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Invoice Detail by ID
   */
  async getInvoiceById(id: number): Promise<any> {
    const [invRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        i.*,
        CONCAT(s.first_name, ' ', s.father_name, ' ', COALESCE(s.grandfather_name, '')) AS student_name,
        s.admission_no,
        s.phone AS student_phone,
        s.email AS student_email,
        ay.name AS academic_year_name
       FROM invoices i
       JOIN students s ON i.student_id = s.id
       LEFT JOIN academic_years ay ON i.academic_year_id = ay.id
       WHERE i.id = ?`,
      [id]
    );

    if (invRows.length === 0) {
      throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND');
    }
    const inv = invRows[0];

    // Items
    const [items] = await pool.query<RowDataPacket[]>(
      `SELECT ii.*, fc.name AS category_name, fc.code AS category_code
       FROM invoice_items ii
       LEFT JOIN fee_categories fc ON ii.fee_category_id = fc.id
       WHERE ii.invoice_id = ?`,
      [id]
    );

    // Payments allocated
    const [allocations] = await pool.query<RowDataPacket[]>(
      `SELECT pa.*, p.receipt_no, p.method, p.received_at, p.status AS payment_status
       FROM payment_allocations pa
       JOIN payments p ON pa.payment_id = p.id
       WHERE pa.invoice_id = ?`,
      [id]
    );

    const totalAmount = items.reduce((acc, it) => acc + Number(it.line_total || 0), 0);
    const paidAmount = allocations
      .filter((a) => a.payment_status === 'posted')
      .reduce((acc, a) => acc + Number(a.allocated_amount || 0), 0);

    return {
      ...inv,
      items,
      allocations,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      balance: Math.max(0, totalAmount - paidAmount)
    };
  }

  /**
   * Create new invoice
   */
  async createInvoice(
    data: {
      student_id: number;
      academic_year_id: number;
      due_date: string;
      notes?: string;
      items: Array<{
        fee_category_id: number;
        description: string;
        quantity: number;
        unit_amount: number;
        discount_amount?: number;
      }>;
    },
    userId: number
  ): Promise<any> {
    if (!data.student_id || !data.academic_year_id || !data.items || data.items.length === 0) {
      throw new AppError('Student, academic year, and at least one item are required', 400, 'INVALID_PARAMS');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Resolve valid academic_year_id
      let yearId = Number(data.academic_year_id);
      const [yearRows] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM academic_years WHERE id = ?`,
        [yearId]
      );
      if (yearRows.length === 0) {
        const [activeYear] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM academic_years WHERE is_current = 1 OR status = 'active' ORDER BY is_current DESC, id ASC LIMIT 1`
        );
        yearId = Number(activeYear[0]?.id || 3);
      }

      // Generate invoice number: INV-YYYY-RANDOM/COUNT
      const [seqRows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) as cnt FROM invoices`
      );
      const count = Number(seqRows[0]?.cnt || 0) + 1;
      const year = new Date().getFullYear();
      const invoiceNo = `INV-${year}-${String(count).padStart(4, '0')}`;

      // Insert invoice
      const [res] = await connection.query<ResultSetHeader>(
        `INSERT INTO invoices (
          invoice_no, student_id, academic_year_id, issue_date, due_date, currency,
          status, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, CURDATE(), ?, 'ETB', 'issued', ?, ?, NOW(3), NOW(3))`,
        [invoiceNo, data.student_id, yearId, data.due_date || null, data.notes || null, userId]
      );
      const invoiceId = res.insertId;

      let grandTotal = 0;
      for (const item of data.items) {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const unitAmt = Math.max(0, Number(item.unit_amount) || 0);
        const discount = Math.max(0, Number(item.discount_amount) || 0);
        const lineTotal = Math.max(0, qty * unitAmt - discount);
        grandTotal += lineTotal;

        await connection.query(
          `INSERT INTO invoice_items (
            invoice_id, fee_category_id, description, quantity, unit_amount,
            discount_amount, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
          [invoiceId, item.fee_category_id, item.description || 'Fee Item', qty, unitAmt, discount]
        );
      }

      // Audit log
      await connection.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
         VALUES (NOW(3), ?, 'admin', 'finance.invoice_created', 'invoices', ?, 'success', ?)`,
        [userId, invoiceId, `Generated ${invoiceNo} for ETB ${grandTotal}`]
      );

      await connection.commit();
      return { id: invoiceId, invoice_no: invoiceNo, total: grandTotal, message: 'Invoice generated successfully' };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Void an Invoice
   */
  async voidInvoice(id: number, reason: string, userId: number): Promise<any> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM invoices WHERE id = ?`,
      [id]
    );
    if (rows.length === 0) {
      throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND');
    }
    const inv = rows[0];
    if (inv.status === 'void') {
      throw new AppError('Invoice is already voided', 400, 'ALREADY_VOID');
    }

    await pool.query(
      `UPDATE invoices 
       SET status = 'void', voided_by = ?, voided_at = NOW(3), void_reason = ?, updated_at = NOW(3)
       WHERE id = ?`,
      [userId, reason || 'Voided by administrator', id]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
       VALUES (NOW(3), ?, 'admin', 'finance.invoice_voided', 'invoices', ?, 'success', ?)`,
      [userId, id, `Voided invoice ${inv.invoice_no}: ${reason}`]
    );

    return { success: true, message: `Invoice ${inv.invoice_no} has been voided.`, invoice: { id, status: 'voided' } };
  }

  /**
   * Payments List
   */
  async getPayments(filters: {
    method?: string;
    studentId?: number;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ items: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    if (filters.method && filters.method !== 'all') {
      whereClauses.push('p.method = ?');
      params.push(filters.method);
    }

    if (filters.studentId) {
      whereClauses.push('p.student_id = ?');
      params.push(filters.studentId);
    }

    if (filters.search) {
      whereClauses.push('(p.receipt_no LIKE ? OR p.reference LIKE ? OR s.admission_no LIKE ? OR s.first_name LIKE ?)');
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term, term);
    }

    const whereSql = whereClauses.join(' AND ');

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM payments p JOIN students s ON p.student_id = s.id WHERE ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        p.id,
        p.receipt_no,
        p.student_id,
        CONCAT(s.first_name, ' ', s.father_name) AS student_name,
        s.admission_no,
        p.amount,
        p.currency,
        p.method,
        p.reference,
        p.payer_name,
        p.received_at,
        p.received_by,
        u.username AS cashier_username,
        p.status,
        p.notes,
        p.created_at,
        (SELECT pa.invoice_id FROM payment_allocations pa WHERE pa.payment_id = p.id LIMIT 1) AS allocated_invoice_id,
        (SELECT i.invoice_no FROM payment_allocations pa JOIN invoices i ON pa.invoice_id = i.id WHERE pa.payment_id = p.id LIMIT 1) AS allocated_invoice_no
       FROM payments p
       JOIN students s ON p.student_id = s.id
       LEFT JOIN users u ON p.received_by = u.id
       WHERE ${whereSql}
       ORDER BY p.received_at DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      items: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Record a Payment (Cashier transaction)
   */
  async recordPayment(
    data: {
      student_id: number;
      invoice_id?: number | null;
      amount: number;
      method: string;
      reference?: string;
      payer_name?: string;
      notes?: string;
    },
    userId: number
  ): Promise<any> {
    const amount = Number(data.amount);
    if (!data.student_id || amount <= 0 || !data.method) {
      throw new AppError('Student, valid amount, and payment method are required', 400, 'INVALID_PARAMS');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Generate receipt number: RCT-YYYY-XXXX
      const [seqRows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) as cnt FROM payments`
      );
      const count = Number(seqRows[0]?.cnt || 0) + 1;
      const year = new Date().getFullYear();
      const receiptNo = `RCT-${year}-${String(count).padStart(4, '0')}`;

      // Insert payment with mandatory idempotency_key
      const idempKey = `IDEMP-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const [payRes] = await connection.query<ResultSetHeader>(
        `INSERT INTO payments (
          receipt_no, student_id, amount, currency, method, reference,
          payer_name, received_at, received_by, status, idempotency_key, notes, created_at, updated_at
        ) VALUES (?, ?, ?, 'ETB', ?, ?, ?, NOW(3), ?, 'posted', ?, ?, NOW(3), NOW(3))`,
        [
          receiptNo,
          data.student_id,
          amount,
          data.method,
          data.reference || null,
          data.payer_name || null,
          userId,
          idempKey,
          data.notes || null
        ]
      );
      const paymentId = payRes.insertId;

      // Allocate to invoice if provided
      if (data.invoice_id) {
        await connection.query(
          `INSERT INTO payment_allocations (
            payment_id, invoice_id, allocated_amount, allocated_by, allocated_at
          ) VALUES (?, ?, ?, ?, NOW(3))`,
          [paymentId, data.invoice_id, amount, userId]
        );

        // Check if invoice is now fully paid
        const [sumRows] = await connection.query<RowDataPacket[]>(
          `SELECT 
            COALESCE((SELECT SUM(line_total) FROM invoice_items WHERE invoice_id = ?), 0) as total,
            COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_id = ?), 0) as paid`,
          [data.invoice_id, data.invoice_id]
        );
        const invTotal = Number(sumRows[0]?.total || 0);
        const invPaid = Number(sumRows[0]?.paid || 0);

        let newStatus = 'issued';
        if (invPaid >= invTotal && invTotal > 0) {
          newStatus = 'paid';
        } else if (invPaid > 0) {
          newStatus = 'partially_paid';
        }

        await connection.query(
          `UPDATE invoices SET status = ?, updated_at = NOW(3) WHERE id = ?`,
          [newStatus, data.invoice_id]
        );
      }

      // Audit log
      await connection.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
         VALUES (NOW(3), ?, 'admin', 'finance.payment_recorded', 'payments', ?, 'success', ?)`,
        [userId, paymentId, `Recorded payment receipt ${receiptNo} for ETB ${amount} via ${data.method}`]
      );

      await connection.commit();
      return {
        id: paymentId,
        receipt_no: receiptNo,
        amount,
        method: data.method,
        message: `Payment of ETB ${amount.toLocaleString()} recorded successfully.`
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Scholarships & Waivers
   */
  async getScholarships(): Promise<any[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        sc.id,
        sc.student_id,
        CONCAT(s.first_name, ' ', s.father_name) AS student_name,
        s.admission_no,
        sc.fee_category_id,
        fc.name AS category_name,
        sc.award_type,
        sc.value,
        sc.reason,
        sc.status,
        sc.valid_from,
        sc.valid_to,
        sc.created_at
       FROM scholarships sc
       JOIN students s ON sc.student_id = s.id
       LEFT JOIN fee_categories fc ON sc.fee_category_id = fc.id
       ORDER BY sc.id DESC`
    );
    return rows;
  }

  async createScholarship(
    data: {
      student_id: number;
      fee_category_id?: number | null;
      award_type: 'percentage' | 'fixed_amount';
      value: number;
      reason: string;
      valid_from?: string;
      valid_to?: string;
    },
    approvedBy: number
  ): Promise<any> {
    if (!data.student_id || !data.value || Number(data.value) <= 0) {
      throw new AppError('Student and valid discount value are required', 400, 'INVALID_PARAMS');
    }

    const rawType = String(data.award_type || '').toLowerCase();
    const awardType = rawType.includes('percent') ? 'percent' : 'fixed';

    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO scholarships (
        student_id, fee_category_id, award_type, value, reason,
        approved_by, valid_from, valid_to, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()), ?, 'active', NOW(3), NOW(3))`,
      [
        data.student_id,
        data.fee_category_id || null,
        awardType,
        data.value,
        data.reason || 'Scholarship waiver awarded',
        approvedBy,
        data.valid_from || null,
        data.valid_to || null
      ]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
       VALUES (NOW(3), ?, 'admin', 'finance.scholarship_granted', 'scholarships', ?, 'success', ?)`,
      [approvedBy, res.insertId, `Granted ${data.award_type} waiver of ${data.value} to student #${data.student_id}`]
    );

    return { id: res.insertId, message: 'Fee waiver / scholarship awarded successfully' };
  }
}

export const financeService = new FinanceService();
