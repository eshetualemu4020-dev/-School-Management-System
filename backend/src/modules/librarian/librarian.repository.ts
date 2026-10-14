import { pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export class LibrarianRepository {
  async getDashboardMetrics() {
    const [counts] = await pool.query<RowDataPacket[]>(
      `SELECT 
         (SELECT COUNT(*) FROM books) as totalBooks,
         (SELECT COUNT(*) FROM book_copies) as totalCopies,
         (SELECT COUNT(*) FROM book_copies WHERE status = 'available') as availableCopies,
         (SELECT COUNT(*) FROM library_loans WHERE returned_at IS NULL) as activeLoans,
         (SELECT COUNT(*) FROM library_loans WHERE returned_at IS NULL AND due_at < NOW()) as overdueLoans,
         (SELECT COUNT(*) FROM library_reservations WHERE status = 'active') as activeReservations`
    );

    return {
      totalBooks: Number(counts[0]?.totalBooks || 0),
      totalCopies: Number(counts[0]?.totalCopies || 0),
      availableCopies: Number(counts[0]?.availableCopies || 0),
      activeLoans: Number(counts[0]?.activeLoans || 0),
      overdueLoans: Number(counts[0]?.overdueLoans || 0),
      activeReservations: Number(counts[0]?.activeReservations || 0)
    };
  }

  async getBooks(search?: string, categoryId?: number) {
    let sql = `
      SELECT 
        b.id,
        b.isbn,
        b.title,
        b.author,
        b.publisher,
        b.publication_year,
        b.language,
        c.id as category_id,
        c.name as category_name,
        COUNT(cp.id) as total_copies,
        SUM(CASE WHEN cp.status = 'available' THEN 1 ELSE 0 END) as available_copies
      FROM books b
      JOIN book_categories c ON b.category_id = c.id
      LEFT JOIN book_copies cp ON b.id = cp.book_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      sql += ` AND (b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (categoryId) {
      sql += ` AND b.category_id = ?`;
      params.push(categoryId);
    }

    sql += ` GROUP BY b.id ORDER BY b.title ASC`;

    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async getBookCategories() {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id, name FROM book_categories ORDER BY name');
    return rows;
  }

  async createBook(payload: {
    isbn?: string;
    title: string;
    author: string;
    publisher?: string;
    publicationYear?: number;
    categoryId: number;
    language?: string;
    barcode: string;
    location?: string;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [bookRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO books (isbn, title, author, publisher, publication_year, category_id, language)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.isbn || null,
          payload.title,
          payload.author,
          payload.publisher || null,
          payload.publicationYear || null,
          payload.categoryId,
          payload.language || 'English'
        ]
      );

      const bookId = bookRes.insertId;

      await conn.query(
        `INSERT INTO book_copies (book_id, barcode, status, location, acquired_on)
         VALUES (?, ?, 'available', ?, CURDATE())`,
        [bookId, payload.barcode, payload.location || 'Main Shelf']
      );

      await conn.commit();
      return bookId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getLoans(filter?: 'all' | 'active' | 'overdue' | 'returned') {
    let sql = `
      SELECT 
        l.id as loan_id,
        l.checkout_at,
        l.due_at,
        l.returned_at,
        l.renewal_count,
        CASE 
          WHEN l.returned_at IS NOT NULL THEN 'returned'
          WHEN l.due_at < NOW() THEN 'overdue'
          ELSE 'active'
        END as loan_status,
        cp.id as copy_id,
        cp.barcode,
        cp.location,
        b.id as book_id,
        b.title as book_title,
        b.author as book_author,
        s.id as student_id,
        s.admission_no,
        CONCAT_WS(' ', s.first_name, s.father_name) as student_name
      FROM library_loans l
      JOIN book_copies cp ON l.copy_id = cp.id
      JOIN books b ON cp.book_id = b.id
      LEFT JOIN students s ON l.student_id = s.id
      WHERE 1=1
    `;

    if (filter === 'active') {
      sql += ` AND l.returned_at IS NULL AND l.due_at >= NOW()`;
    } else if (filter === 'overdue') {
      sql += ` AND l.returned_at IS NULL AND l.due_at < NOW()`;
    } else if (filter === 'returned') {
      sql += ` AND l.returned_at IS NOT NULL`;
    }

    sql += ` ORDER BY l.checkout_at DESC LIMIT 100`;

    const [rows] = await pool.query<RowDataPacket[]>(sql);
    return rows;
  }

  async issueLoan(copyBarcode: string, studentAdmissionNo: string, dueDate: string, issuedByUserId: number) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check copy
      const [copyRows] = await conn.query<RowDataPacket[]>(
        'SELECT id, book_id, status FROM book_copies WHERE barcode = ? FOR UPDATE',
        [copyBarcode]
      );
      if (copyRows.length === 0) {
        throw new Error(`Book copy with barcode '${copyBarcode}' not found.`);
      }
      if (copyRows[0].status !== 'available') {
        throw new Error(`Book copy '${copyBarcode}' is currently ${copyRows[0].status}.`);
      }

      // Check student
      const [studentRows] = await conn.query<RowDataPacket[]>(
        'SELECT id, status FROM students WHERE admission_no = ?',
        [studentAdmissionNo]
      );
      if (studentRows.length === 0) {
        throw new Error(`Student with admission number '${studentAdmissionNo}' not found.`);
      }

      const copyId = copyRows[0].id;
      const studentId = studentRows[0].id;

      // Insert loan
      const [loanRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO library_loans (copy_id, student_id, checkout_at, due_at, issued_by)
         VALUES (?, ?, NOW(), ?, ?)`,
        [copyId, studentId, dueDate, issuedByUserId]
      );

      // Update copy status
      await conn.query("UPDATE book_copies SET status = 'on_loan' WHERE id = ?", [copyId]);

      await conn.commit();
      return loanRes.insertId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async returnLoan(loanId: number, receivedByUserId: number) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [loanRows] = await conn.query<RowDataPacket[]>(
        'SELECT id, copy_id, returned_at FROM library_loans WHERE id = ? FOR UPDATE',
        [loanId]
      );
      if (loanRows.length === 0) {
        throw new Error('Loan record not found.');
      }
      if (loanRows[0].returned_at !== null) {
        throw new Error('This loan has already been marked as returned.');
      }

      const copyId = loanRows[0].copy_id;

      // Update loan
      await conn.query(
        'UPDATE library_loans SET returned_at = NOW(), received_by = ? WHERE id = ?',
        [receivedByUserId, loanId]
      );

      // Update copy
      await conn.query("UPDATE book_copies SET status = 'available' WHERE id = ?", [copyId]);

      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getReservations() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         r.id,
         r.status,
         r.reserved_at,
         r.expires_at,
         b.title as book_title,
         b.author as book_author,
         s.admission_no,
         CONCAT_WS(' ', s.first_name, s.father_name) as student_name
       FROM library_reservations r
       JOIN books b ON r.book_id = b.id
       JOIN students s ON r.student_id = s.id
       ORDER BY r.reserved_at DESC`
    );
    return rows;
  }
}
