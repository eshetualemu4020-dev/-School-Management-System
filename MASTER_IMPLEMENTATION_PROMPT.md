# MASTER PROMPT: High School & Preparatory School Management System (HSPSMS v4.1)

> **Role & Task Definition:**  
> You are an expert Full-Stack Software Architect and Principal Engineer. You are tasked with implementing the complete **High School and Preparatory School Management System (HSPSMS v4.1)** according to the verified 93-page Software Requirements Specification and Technical Specification.
>
> **CRITICAL ARCHITECTURAL DIRECTIVE: NO PRISMA ORM.**  
> Do NOT use Prisma, TypeORM, or Sequelize. Implement the data layer using **raw parameterized SQL queries with `mysql2/promise`**, connection pooling, and explicit ACID transactions. This provides 100% native compatibility with MySQL 8 virtual generated columns, `SELECT ... FOR UPDATE` row-level locks, CHECK constraints, and maximum performance.

---

## 1. TECHNOLOGY STACK & ARCHITECTURE

### Backend Architecture
- **Runtime & Language:** Node.js 20+ with TypeScript (strict mode enabled).
- **Framework:** Express.js 5.x.
- **Database Driver:** `mysql2/promise` with connection pooling (`createPool`).
- **Data Layer Architecture:** Repository / Service / Controller pattern.
  - *Repositories:* Raw parameterized SQL queries (`db.execute('SELECT ... WHERE id = ?', [id])`).
  - *Services:* Business logic, transaction orchestration (`connection.beginTransaction()`, `commit()`, `rollback()`), and cross-table validation.
  - *Controllers:* HTTP request parsing, status codes, and uniform response formatting.
- **Authentication:** Stateless JWT access tokens (15-minute expiration) with rotating, revocable refresh tokens (7 days, stored hashed in `refresh_sessions`). Passwords hashed with `bcrypt` (salt rounds: 12).
- **Validation:** `zod` for all request bodies, query params, and environment variables.
- **Security Middlewares:** `cors`, `helmet`, `express-rate-limit`, correlation ID tracking (`uuidv4` attached as `X-Request-Id`).

### Frontend Architecture
- **Framework:** React 18+ with TypeScript and Vite.
- **Styling:** Vanilla CSS / Tailwind CSS using the design tokens defined in Section II-C (#1F3A5F primary navy, #2E6DA4 accent blue, #F4F6F8 background).
- **Routing:** React Router v6 with protected, role-aware route guards.
- **State & API Handling:** Axios with request/response interceptors for automatic JWT refresh token rotation.

---

## 2. DATABASE INITIALIZATION & SCHEMA INVARIANTS

### DDL & Role Seeding
1. Execute `schema.sql` against MySQL 8.0+ (InnoDB, UTF-8 `utf8mb4_0900_ai_ci`).
2. Execute `seed_roles.sql` to initialize the **7 application roles**, **43 granular permissions**, and **107 grants**.
3. Establish a connection pool in `src/config/database.ts`:
   ```typescript
   import mysql from 'mysql2/promise';

   export const pool = mysql.createPool({
     host: process.env.MYSQL_SERVER || 'localhost',
     port: Number(process.env.MYSQL_PORT) || 3306,
     user: process.env.MYSQL_USER || 'root',
     password: process.env.MYSQL_PASSWORD || '',
     database: process.env.MYSQL_DB || 'school_erp',
     waitForConnections: true,
     connectionLimit: 20,
     queueLimit: 0,
     decimalNumbers: true
   });
   ```

### Critical Database Integrity Rules
- **Money & Scores:** Money columns must use `DECIMAL(12,2)`. Marks must use `DECIMAL(6,2)`. Percentages must use `DECIMAL(5,2)`. NEVER use `FLOAT` or `DOUBLE`.
- **Foreign Key Behavior:** Historical records must NEVER cascade delete.
  - `RESTRICT` on all references to students, teachers, sections, subjects, invoices, and marks.
  - `SET NULL` on `created_by`, `updated_by`, and audit user references.
  - `CASCADE` only on dependent tokens, user roles, grade bands, and announcement targets.
- **Generated Columns for NULL Uniqueness:**
  - `stream_key`: Enables single active section per name/grade/year even when `stream_id` is NULL (Grades 9–10).
  - `active_key`: Enforces exactly one active enrollment per student per academic year.

---

## 3. DOMAIN INVARIANTS: ETHIOPIAN HIGH SCHOOL & PREPARATORY STREAMS

Implement strict service-layer and SQL checks for Grades 9–12:
1. **Grades 9–10 (General Secondary):**
   - Common curriculum. `stream_id` MUST be `NULL`.
   - All students in a grade share common subjects.
2. **Grades 11–12 (Preparatory):**
   - Every active student MUST have exactly one stream: `Natural Science` (`NS`) or `Social Science` (`SS`).
   - `stream_id` is mandatory during enrollment.
   - Students may ONLY be enrolled in a section matching their assigned stream (`BR-016`).
   - Teachers may only enter marks for common subjects or subjects belonging to the student's assigned stream (`BR-017`).
3. **Stream Re-assignment (`PUT /api/v1/students/:id/stream`):**
   - Requires `student.stream.change` permission.
   - In an ACID transaction: mark old enrollment as `transferred`, create new enrollment in the target stream section, and write an immutable record into `audit_logs`.

---

## 4. RBAC & SECURITY SPECIFICATION

The application supports strictly **7 stakeholder roles**:
1. **administrator:** School oversight, academic structure setup and so on..........
2. **Registrar:** Admissions, student profiles, guardian links, enrollment (including stream selection), and transfers.
3. **Teacher:** Assigned sections/subjects, daily attendance taking, marks entry, and assignment grading.
5. **Librarian:** Catalog, physical copies, borrowing checkout/return, overdue fines.
6. **Student:** View own timetable, attendance, assignments, and published report cards.
7. **Parent / Guardian:** View linked child’s attendance, published results, fee balances, and notices.

### Authorization Middleware Rules
- Check both granular permission (e.g. `attendance.record`) AND record-level scope:
  - *Teacher check:* Verify the teacher is assigned to `(section_id, subject_id, academic_year_id)` in `teaching_assignments`.
  - *Parent check:* Verify `student_guardians` contains `(student_id, guardian_id)`.
  - *Student check:* Verify `enrollment.student_id` matches the authenticated user's student profile.

---

## 5. API CONTRACTS & WORKFLOW IMPLEMENTATION

All endpoints must be mounted at `/api/v1` and follow uniform response contracts:

### Response Format
- **Success (Single):** `{ "data": { ... } }`
- **Success (List):** `{ "data": [ ... ], "meta": { "page": 1, "pageSize": 20, "totalItems": 100, "totalPages": 5 } }`
- **Error:** `{ "error": { "code": "ERROR_CODE", "message": "User-friendly message", "requestId": "uuid", "details": [ { "field": "...", "rule": "...", "message": "..." } ] } }`

### Core Workflows to Implement (with ACID Transactions)
1. **Student Admission with Enrollment (`POST /api/v1/students`):**
   - Insert `students`, insert `guardians`, link `student_guardians`, insert `enrollments`, update `doc_sequences` for admission number (`HS-YYYY-XXXX`). All in one single database transaction.
2. **Daily Attendance Taking (`POST /attendance/sessions` & `PUT /attendance/sessions/:id/records`):**
   - Verify teacher assignment. Lock session after submission. Reject duplicate session on same date/period (`409 DUPLICATE_ATTENDANCE_SESSION`).
3. **Examination & Marks Lifecycle:**
   - Teacher inputs marks (`PUT /assessments/:id/marks`). Reject marks where `score < 0` or `score > assessments.max_score` (`422 MARK_OUT_OF_RANGE`).
   - Workflow states: `draft` -> `submitted` -> `approved` -> `published`.
   - Post-publication mark changes require Principal approval and insert into `mark_corrections`.
4. **Invoicing & Payment Allocation (`POST /payments`):**
   - Require `Idempotency-Key` header.
   - Fetch next receipt number atomically via `SELECT last_value FROM doc_sequences WHERE seq_key = 'receipt' FOR UPDATE`.
   - Prevent overpayment (`amount <= outstanding_balance`).
   - Insert `payments`, insert `payment_allocations`, update invoice balances.
   - Voids/refunds use `POST /payments/:id/reversal`—never delete the payment row!

---

## 6. ASYNC NOTIFICATIONS & THIRD-PARTY INTEGRATIONS

1. **Transactional Notification Outbox:**
   - When an absence or published result occurs, write directly to `notification_outbox` inside the main business transaction.
   - Implement a background worker (interval: 30s) that processes queued items with exponential backoff (`1, 5, 15, 60, 240` minutes) up to 5 attempts before marking `dead`.
2. **Chapa Payment Gateway Webhook (`POST /api/v1/webhooks/chapa`):**
   - Compute `HMAC-SHA256` of the raw request body with `CHAPA_WEBHOOK_SECRET` and compare constant-time with `x-chapa-signature`.
   - Deduplicate via `payment_webhook_events(event_id)`.
   - Call Chapa verification endpoint to verify transaction before allocating invoice balances.

---

## 7. LEGACY DATA MIGRATION ENGINE (Part II-F)

Implement the CSV Migration runner for the 13 dependency-ordered templates:
`01_academic_years.csv` -> `02_terms.csv` -> `03_sections.csv` -> `04_subjects.csv` -> `05_grade_subjects.csv` -> `06_staff.csv` -> `07_teaching_assignments.csv` -> `08_students.csv` -> `09_guardians.csv` -> `10_enrollments.csv` -> `11_fee_structures.csv` -> `12_opening_balances.csv` -> `13_books_copies.csv`.

- **Dry-Run Mode (`POST /api/v1/imports`):** Validates syntax, headers, date ranges, and foreign key references. Logs row errors to `import_errors`.
- **Commit Mode (`POST /api/v1/imports/:id/commit`):** Executes database inserts inside a single transaction per batch.

---

## 8. STEP-BY-STEP IMPLEMENTATION ROADMAP

Execute this build in strict order:
- **Step 1: Database Setup:** Load `schema.sql` and `seed_roles.sql` into local MySQL. Configure `backend/.env`.
- **Step 2: Backend Core:** Setup Express server with TypeScript, error middleware, and MySQL2 pool.
- **Step 3: Auth & RBAC Module:** Implement `/api/v1/auth/login`, token refresh, and RBAC guard middleware.
- **Step 4: Academic & Student Core:** Implement student registration, Grade 11–12 stream enrollment, and section assignments.
- **Step 5: Attendance & Marks Engines:** Implement attendance grid and marks approval/publication workflows.
- **Step 6: Financial Ledger:** Implement invoicing, idempotent payments, and receipt generation with row locking.
- **Step 7: Frontend Portals:** Connect `frontend/src/App.tsx` and build role dashboards (Principal, Teacher, Registrar, Accountant, Student/Parent).
- **Step 8: Verification & Tests:** Execute Supertest API tests for all acceptance criteria (`AT-01` through `AT-13` and `AT-M1` through `AT-M4`).
