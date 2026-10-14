-- School Management ERP - reference data (safe to run in production; idempotent)
-- Roles, permissions and the permission matrix come from SRS v1.1 addendum section 8.
-- Values marked PLACEHOLDER are defaults the school must confirm (SRS section 13.3).
SET NAMES utf8mb4;

INSERT INTO
    roles (
        code,
        name,
        description,
        is_system
    )
VALUES (
        'system_admin',
        'System Administrator',
        'Manage users, roles, settings and integrations',
        1
    ),
    (
        'principal',
        'Principal',
        'School-wide dashboards, approvals, policies and reports',
        1
    ),
    (
        'academic_director',
        'Academic Director',
        'Academic years, subjects, timetable, assessments and result publication',
        1
    ),
    (
        'registrar',
        'Registrar',
        'Admissions, student profiles, guardian links, enrollment, transfers and promotions',
        1
    ),
    (
        'teacher',
        'Teacher',
        'Assigned classes: attendance, assignments and marks',
        1
    ),
    (
        'accountant',
        'Accountant',
        'Fee plans, invoices, payments, receipts and finance reports',
        1
    ),
    (
        'librarian',
        'Librarian',
        'Catalog, copies, loans, returns and reservations',
        1
    ),
    (
        'student',
        'Student',
        'Own timetable, attendance, assignments and published results',
        1
    ),
    (
        'guardian',
        'Parent/Guardian',
        'Records of verified linked children',
        1
    )
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description);

INSERT INTO
    permissions (code, module, description)
VALUES (
        'user.manage',
        'identity',
        'Create, disable and assign roles to users'
    ),
    (
        'settings.manage',
        'identity',
        'Change school settings'
    ),
    (
        'audit.read',
        'identity',
        'Read the audit log'
    ),
    (
        'student.read',
        'people',
        'View student records'
    ),
    (
        'student.create',
        'people',
        'Create student profiles'
    ),
    (
        'student.update',
        'people',
        'Edit student profiles'
    ),
    (
        'guardian.verify',
        'people',
        'Verify guardians'
    ),
    (
        'enrollment.manage',
        'people',
        'Enroll, transfer and withdraw students'
    ),
    (
        'promotion.manage',
        'people',
        'Record promotion decisions'
    ),
    (
        'staff.manage',
        'people',
        'Manage staff records'
    ),
    (
        'academic.configure',
        'academic',
        'Manage years, terms, grades, sections and subjects'
    ),
    (
        'timetable.manage',
        'academic',
        'Build and change the timetable'
    ),
    (
        'attendance.record',
        'attendance',
        'Record attendance'
    ),
    (
        'attendance.correct',
        'attendance',
        'Correct submitted attendance'
    ),
    (
        'attendance.read',
        'attendance',
        'View attendance and summaries'
    ),
    (
        'assignment.manage',
        'learning',
        'Create assignments and resources'
    ),
    (
        'assignment.submit',
        'learning',
        'Submit assignment work'
    ),
    (
        'assessment.configure',
        'results',
        'Configure assessments and grading'
    ),
    (
        'marks.enter',
        'results',
        'Enter marks'
    ),
    (
        'marks.correct',
        'results',
        'Correct marks after submission'
    ),
    (
        'results.approve',
        'results',
        'Approve results'
    ),
    (
        'results.publish',
        'results',
        'Publish results'
    ),
    (
        'results.read',
        'results',
        'View published results'
    ),
    (
        'fee.configure',
        'finance',
        'Configure fee categories and structures'
    ),
    (
        'invoice.create',
        'finance',
        'Create and issue invoices'
    ),
    (
        'payment.record',
        'finance',
        'Record payments and allocations'
    ),
    (
        'payment.reverse',
        'finance',
        'Request or approve refunds, voids and reversals'
    ),
    (
        'finance.read',
        'finance',
        'View invoices, balances and finance reports'
    ),
    (
        'library.manage',
        'library',
        'Manage the catalog, loans and reservations'
    ),
    (
        'announcement.create',
        'communication',
        'Create announcements'
    ),
    (
        'report.read',
        'reports',
        'View reports and dashboards'
    ),
    (
        'report.export',
        'reports',
        'Export reports'
    )
ON DUPLICATE KEY UPDATE
    module = VALUES(module),
    description = VALUES(description);

INSERT INTO
    role_permissions (
        role_id,
        permission_id,
        access_level
    )
VALUES (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'system_admin'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'user.manage'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'system_admin'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'settings.manage'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'settings.manage'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'settings.manage'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'system_admin'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'audit.read'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'audit.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'student.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'student.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'registrar'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'student.read'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'teacher'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'student.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'accountant'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'student.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'librarian'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'student.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'student'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'student.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'guardian'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'student.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'registrar'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'student.create'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'registrar'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'student.update'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'registrar'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'guardian.verify'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'registrar'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'enrollment.manage'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'promotion.manage'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'promotion.manage'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'registrar'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'promotion.manage'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'system_admin'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'staff.manage'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'staff.manage'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'academic.configure'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'academic.configure'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'registrar'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'academic.configure'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'timetable.manage'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'teacher'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'attendance.record'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'attendance.correct'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'teacher'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'attendance.correct'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'attendance.read'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'attendance.read'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'registrar'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'attendance.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'teacher'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'attendance.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'student'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'attendance.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'guardian'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'attendance.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'teacher'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'assignment.manage'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'student'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'assignment.submit'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'assessment.configure'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'teacher'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'assessment.configure'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'teacher'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'marks.enter'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'marks.correct'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'results.approve'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'results.approve'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'results.publish'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'results.read'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'results.read'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'registrar'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'results.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'teacher'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'results.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'student'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'results.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'guardian'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'results.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'accountant'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'fee.configure'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'accountant'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'invoice.create'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'accountant'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'payment.record'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'payment.reverse'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'accountant'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'payment.reverse'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'finance.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'accountant'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'finance.read'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'guardian'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'finance.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'library.manage'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'librarian'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'library.manage'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'announcement.create'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'announcement.create'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'registrar'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'announcement.create'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'teacher'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'announcement.create'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'accountant'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'announcement.create'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'report.read'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'report.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'registrar'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'report.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'teacher'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'report.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'accountant'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'report.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'librarian'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'report.read'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'principal'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'report.export'
        ),
        'full'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'academic_director'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'report.export'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'registrar'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'report.export'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'accountant'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'report.export'
        ),
        'limited'
    ),
    (
        (
            SELECT id
            FROM roles
            WHERE
                code = 'librarian'
        ),
        (
            SELECT id
            FROM permissions
            WHERE
                code = 'report.export'
        ),
        'limited'
    )
ON DUPLICATE KEY UPDATE
    access_level = VALUES(access_level);

INSERT INTO
    attendance_statuses (
        code,
        name,
        counts_as_present,
        is_excused,
        sort_order
    )
VALUES ('present', 'Present', 1, 0, 1),
    ('late', 'Late', 1, 0, 2),
    ('absent', 'Absent', 0, 0, 3),
    ('excused', 'Excused', 0, 1, 4)
ON DUPLICATE KEY UPDATE
    name = VALUES(name);

INSERT INTO
    payment_methods (
        code,
        name,
        requires_reference,
        sort_order
    )
VALUES ('cash', 'Cash', 0, 1),
    (
        'bank_transfer',
        'Bank transfer',
        1,
        2
    ),
    ('telebirr', 'Telebirr', 1, 3),
    ('cbe_birr', 'CBE Birr', 1, 4)
ON DUPLICATE KEY UPDATE
    name = VALUES(name);

INSERT INTO
    assessment_types (code, name)
VALUES ('quiz', 'Quiz'),
    ('assignment', 'Assignment'),
    ('test', 'Test'),
    ('mid_exam', 'Mid-term exam'),
    ('final_exam', 'Final exam'),
    ('project', 'Project'),
    ('practical', 'Practical')
ON DUPLICATE KEY UPDATE
    name = VALUES(name);

INSERT INTO
    grades (
        grade_level,
        display_name,
        has_streams
    )
VALUES (9, 'Grade 9', 0),
    (10, 'Grade 10', 0),
    (11, 'Grade 11', 1),
    (12, 'Grade 12', 1)
ON DUPLICATE KEY UPDATE
    display_name = VALUES(display_name),
    has_streams = VALUES(has_streams);

INSERT INTO
    fee_categories (code, name, is_recurring)
VALUES ('tuition', 'Tuition', 1),
    (
        'registration',
        'Registration',
        0
    ),
    ('exam', 'Examination', 0),
    ('library', 'Library', 0),
    ('other', 'Other', 0)
ON DUPLICATE KEY UPDATE
    name = VALUES(name);

INSERT INTO
    system_settings (
        setting_key,
        value_json,
        description
    )
VALUES (
        'school.name',
        '"Your School Name"',
        'Display name of the school; replace at setup'
    ),
    (
        'school.tagline',
        '"High School & Preparatory Excellence"',
        'Short marketable tagline used on the public home page'
    ),
    (
        'school.motto',
        '"Excellence, Discipline and Service"',
        'School motto or mission statement for the public landing page'
    ),
    (
        'school.address',
        '"Harar, Ethiopia"',
        'School street address or city shown on the public site'
    ),
    (
        'school.phone',
        '"+251-25-000-0000"',
        'Primary contact phone number for the public site'
    ),
    (
        'school.email',
        '"info@school.et"',
        'Public school email address displayed on the website'
    ),
    (
        'school.hero_title',
        '"Learn. Lead. Excel."',
        'Hero headline for the public home page'
    ),
    (
        'school.hero_subtitle',
        '"A student-centered learning community that nurtures academic excellence, character, and service."',
        'Hero subtitle used on the public landing page'
    ),
    (
        'site.home.hero_title',
        '"Learn. Lead. Excel."',
        'Alias for the public home page headline'
    ),
    (
        'site.home.hero_subtitle',
        '"A student-centered learning community that nurtures academic excellence, character, and service."',
        'Alias for the public home page subtitle'
    ),
    (
        'site.home.cta_label',
        '"Apply for Admission"',
        'Primary CTA label shown on the public landing page'
    ),
    (
        'school.country',
        '"ET"',
        'ISO 3166 country code'
    ),
    (
        'school.timezone',
        '"Africa/Addis_Ababa"',
        'Display time zone; the database stores UTC'
    ),
    (
        'i18n.default_language',
        '"en"',
        'Default UI language: en, am or om'
    ),
    (
        'calendar.display',
        '"ethiopian"',
        'Calendar shown in the UI: ethiopian or gregorian (confirm with the school)'
    ),
    (
        'calendar.export',
        '"gregorian"',
        'Calendar used in exported files'
    ),
    (
        'finance.currency',
        '"ETB"',
        'Default ISO 4217 currency code'
    ),
    (
        'attendance.mode',
        '"daily"',
        'daily or per_period (FR-ATT-07)'
    ),
    (
        'attendance.guardian_alert_statuses',
        '["absent"]',
        'Statuses that notify linked guardians'
    ),
    (
        'academic.terms_per_year',
        '2',
        'Default number of terms; schools may differ (FR-ETH-09)'
    ),
    (
        'grading.weights_must_total_100',
        'true',
        'Default for new subject grading rules'
    ),
    (
        'grading.pass_mark',
        '50',
        'PLACEHOLDER - the school must approve the pass mark'
    ),
    (
        'grading.missing_mark_rule',
        '"incomplete"',
        'zero, exclude or incomplete'
    ),
    (
        'promotion.policy',
        '{"status":"placeholder","note":"The school must define promotion and ranking rules (FR-EXAM-09)"}',
        'Promotion and ranking policy'
    ),
    (
        'enrollment.allow_over_capacity',
        'false',
        'Allow enrollment beyond section capacity'
    ),
    (
        'security.max_failed_logins',
        '5',
        'Failed sign-ins before a temporary lockout'
    ),
    (
        'security.lockout_minutes',
        '15',
        'Lockout length'
    ),
    (
        'security.access_token_minutes',
        '15',
        'Access token lifetime'
    ),
    (
        'security.refresh_token_days',
        '14',
        'Refresh session lifetime'
    ),
    (
        'library.loan_days',
        '14',
        'Default loan period'
    ),
    (
        'library.max_loans_per_student',
        '3',
        'Concurrent loans per student'
    ),
    (
        'library.fines_enabled',
        'false',
        'Charge fines for overdue items'
    ),
    (
        'library.fine_per_day',
        '0',
        'Fine per overdue day in the default currency'
    ),
    (
        'uploads.max_mb',
        '10',
        'Maximum upload size in megabytes'
    ),
    (
        'uploads.allowed_mime_types',
        '["application/pdf","image/jpeg","image/png"]',
        'Allowed upload content types'
    ),
    (
        'numbering.admission_prefix',
        '"ADM"',
        'Prefix for admission numbers'
    ),
    (
        'numbering.invoice_prefix',
        '"INV"',
        'Prefix for invoice numbers'
    ),
    (
        'numbering.receipt_prefix',
        '"RCT"',
        'Prefix for receipt numbers'
    ),
    (
        'retention.audit_log_years',
        '7',
        'PLACEHOLDER - the school must approve retention periods'
    )
ON DUPLICATE KEY UPDATE
    description = VALUES(description);