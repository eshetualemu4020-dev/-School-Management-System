import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import '../StakeholderDashboards.css';

interface LibrarianDashboardProps {
  user: {
    username: string;
    role: string;
    permissions: string[];
    staffName?: string;
  };
  onLogout: () => void;
}

export default function LibrarianDashboard({ user, onLogout }: LibrarianDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'catalog' | 'loans' | 'reservations'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Data states
  const [dashData, setDashData] = useState<any>(null);
  const [booksList, setBooksList] = useState<any[]>([]);
  const [loansList, setLoansList] = useState<any[]>([]);
  const [reservationsList, setReservationsList] = useState<any[]>([]);

  // Search & Filter
  const [bookSearch, setBookSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>(undefined);
  const [loanStatusFilter, setLoanStatusFilter] = useState('');

  // Modals
  const [addBookModalOpen, setAddBookModalOpen] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookAuthor, setNewBookAuthor] = useState('');
  const [newBookIsbn, setNewBookIsbn] = useState('');
  const [newBookCategory, setNewBookCategory] = useState(1);
  const [newBookCopies, setNewBookCopies] = useState(2);
  const [newBookShelf, setNewBookShelf] = useState('Shelf A-1');
  const [submittingBook, setSubmittingBook] = useState(false);

  const [issueLoanModalOpen, setIssueLoanModalOpen] = useState(false);
  const [issueCopyId, setIssueCopyId] = useState<number>(1);
  const [issueStudentId, setIssueStudentId] = useState<number>(1);
  const [issueDueDate, setIssueDueDate] = useState<string>('');
  const [submittingLoan, setSubmittingLoan] = useState(false);

  useEffect(() => {
    loadLibrarianData();
  }, []);

  const loadLibrarianData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getLibrarianDashboard();
      setDashData(data);
      // Pre-set 14 days due date for issuing loan
      const d = new Date();
      d.setDate(d.getDate() + 14);
      setIssueDueDate(d.toISOString().split('T')[0]);
    } catch (err: any) {
      setError(err.message || 'Failed to load librarian dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const loadBooks = async () => {
    try {
      const books = await api.getLibrarianBooks(bookSearch, selectedCategory);
      setBooksList(books);
    } catch (err: any) {
      setActionMessage({ text: 'Failed to load book catalog: ' + err.message, type: 'error' });
    }
  };

  const loadLoans = async () => {
    try {
      const loans = await api.getLibrarianLoans(loanStatusFilter);
      setLoansList(loans);
    } catch (err: any) {
      setActionMessage({ text: 'Failed to load loans: ' + err.message, type: 'error' });
    }
  };

  const loadReservations = async () => {
    try {
      const res = await api.getLibrarianReservations();
      setReservationsList(res);
    } catch (err: any) {
      setActionMessage({ text: 'Failed to load reservations: ' + err.message, type: 'error' });
    }
  };

  const handleTabSwitch = (tab: 'overview' | 'catalog' | 'loans' | 'reservations') => {
    setActiveTab(tab);
    setActionMessage(null);
    if (tab === 'catalog') loadBooks();
    if (tab === 'loans') loadLoans();
    if (tab === 'reservations') loadReservations();
  };

  const handleAddBook = async (e: FormEvent) => {
    e.preventDefault();
    if (!newBookTitle.trim() || !newBookAuthor.trim()) {
      setActionMessage({ text: 'Title and author are required.', type: 'error' });
      return;
    }

    setSubmittingBook(true);
    try {
      await api.addLibrarianBook({
        title: newBookTitle.trim(),
        author: newBookAuthor.trim(),
        isbn: newBookIsbn.trim() || undefined,
        categoryId: Number(newBookCategory),
        totalCopies: Number(newBookCopies),
        shelfLocation: newBookShelf.trim()
      });
      setActionMessage({ text: `Book "${newBookTitle}" successfully cataloged into MySQL!`, type: 'success' });
      setNewBookTitle('');
      setNewBookAuthor('');
      setNewBookIsbn('');
      setAddBookModalOpen(false);
      loadLibrarianData();
      if (activeTab === 'catalog') loadBooks();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to add book: ' + err.message, type: 'error' });
    } finally {
      setSubmittingBook(false);
    }
  };

  const handleIssueLoan = async (e: FormEvent) => {
    e.preventDefault();
    setSubmittingLoan(true);
    try {
      await api.issueBookLoan({
        bookCopyId: Number(issueCopyId),
        studentId: Number(issueStudentId),
        dueDate: issueDueDate
      });
      setActionMessage({ text: 'Book loan successfully issued and registered!', type: 'success' });
      setIssueLoanModalOpen(false);
      loadLibrarianData();
      if (activeTab === 'loans') loadLoans();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to issue loan: ' + err.message, type: 'error' });
    } finally {
      setSubmittingLoan(false);
    }
  };

  const handleReturnBook = async (loanId: number) => {
    try {
      await api.returnBookLoan(loanId);
      setActionMessage({ text: `Loan #${loanId} returned and copy marked available!`, type: 'success' });
      loadLibrarianData();
      if (activeTab === 'loans') loadLoans();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to process book return: ' + err.message, type: 'error' });
    }
  };

  return (
    <div className="sh-shell">
      {/* Topbar */}
      <header className="sh-topbar">
        <div className="sh-topbar-brand">
          <div className="sh-topbar-logo">H</div>
          <div className="sh-topbar-title">
            <h1>HSPSMS v4.1</h1>
            <span>Library Management Portal</span>
          </div>
        </div>

        <div className="sh-topbar-actions">
          <div className="sh-user-badge">
            <div className="sh-user-avatar">L</div>
            <div>
              <span className="sh-user-name">{user.staffName || user.username}</span>
              <span className="sh-user-role" style={{ marginLeft: 8 }}>Librarian</span>
            </div>
          </div>
          <button className="sh-logout-btn" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Nav Tabs */}
      <nav className="sh-nav-bar">
        <div className="sh-nav-tabs">
          <button
            className={`sh-nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('overview')}
          >
            📊 Circulation Overview
          </button>
          <button
            className={`sh-nav-tab ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('catalog')}
          >
            📚 Catalog & Books
          </button>
          <button
            className={`sh-nav-tab ${activeTab === 'loans' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('loans')}
          >
            🔄 Active & Overdue Loans
          </button>
          <button
            className={`sh-nav-tab ${activeTab === 'reservations' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('reservations')}
          >
            📑 Book Reservations
          </button>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="sh-btn sh-btn-secondary sh-btn-sm" onClick={() => setIssueLoanModalOpen(true)}>
            🔄 Issue Loan
          </button>
          <button className="sh-btn sh-btn-primary sh-btn-sm" onClick={() => setAddBookModalOpen(true)}>
            + Add New Book
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="sh-content">
        {actionMessage && (
          <div className={`sh-alert sh-alert-${actionMessage.type}`}>
            {actionMessage.type === 'success' ? '✓' : '⚠'} {actionMessage.text}
          </div>
        )}

        {loading ? (
          <div className="sh-loading">
            <div className="sh-spinner"></div>
            <span>Loading library inventory and circulation metrics from MySQL...</span>
          </div>
        ) : error ? (
          <div className="sh-alert sh-alert-error">
            <span>Failed to load library data: {error}</span>
            <button className="sh-btn sh-btn-sm sh-btn-secondary" onClick={loadLibrarianData} style={{ marginLeft: 16 }}>
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && dashData && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Library Inventory & Circulation Summary</h2>
                    <p className="sh-page-desc">Real-time book copies, active borrowing circulation, and overdue tracking</p>
                  </div>
                </div>

                {/* Metrics */}
                <div className="sh-metrics-grid">
                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Total Catalog Titles</h4>
                      <div className="sh-metric-value">{dashData.metrics.totalBooks}</div>
                      <p className="sh-metric-sub">Across 5 categories</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-blue">📚</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Physical Copies</h4>
                      <div className="sh-metric-value">{dashData.metrics.totalCopies}</div>
                      <p className="sh-metric-sub">{dashData.metrics.availableCopies} currently available</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-emerald">📖</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Borrowed Loans</h4>
                      <div className="sh-metric-value">{dashData.metrics.borrowedCopies}</div>
                      <p className="sh-metric-sub">Active in circulation</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-purple">🔄</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Overdue Items</h4>
                      <div className="sh-metric-value" style={{ color: dashData.metrics.overdueCount > 0 ? '#DC2626' : '#059669' }}>
                        {dashData.metrics.overdueCount}
                      </div>
                      <p className="sh-metric-sub">{dashData.metrics.overdueCount > 0 ? 'Requires student notification' : 'No overdue loans'}</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-rose">⏰</div>
                  </div>
                </div>

                {/* Split: Recent Loans & Overdue Loans */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                  <div className="sh-panel">
                    <div className="sh-panel-header">
                      <h3 className="sh-panel-title">🔄 Active Circulation Loans</h3>
                    </div>
                    <div className="sh-panel-body" style={{ padding: 0 }}>
                      <table className="sh-table">
                        <thead>
                          <tr>
                            <th>Book Title</th>
                            <th>Student</th>
                            <th>Issue Date</th>
                            <th>Due Date</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashData.recentLoans && dashData.recentLoans.length > 0 ? (
                            dashData.recentLoans.map((l: any) => (
                              <tr key={l.id}>
                                <td style={{ fontWeight: 700 }}>{l.title}</td>
                                <td>{l.first_name} {l.father_name} ({l.admission_no})</td>
                                <td>{new Date(l.issue_date).toLocaleDateString()}</td>
                                <td style={{ fontWeight: 600 }}>{new Date(l.due_date).toLocaleDateString()}</td>
                                <td>
                                  <span
                                    className={`sh-badge ${
                                      l.status === 'borrowed'
                                        ? 'sh-badge-blue'
                                        : l.status === 'overdue'
                                        ? 'sh-badge-rose'
                                        : 'sh-badge-emerald'
                                    }`}
                                  >
                                    {l.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="sh-table-empty">
                                No active loans in circulation.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="sh-panel">
                    <div className="sh-panel-header">
                      <h3 className="sh-panel-title">⏰ Overdue Items Alert</h3>
                    </div>
                    <div className="sh-panel-body" style={{ padding: 0 }}>
                      <table className="sh-table">
                        <thead>
                          <tr>
                            <th>Book Title</th>
                            <th>Borrower</th>
                            <th>Due Date</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashData.overdueLoans && dashData.overdueLoans.length > 0 ? (
                            dashData.overdueLoans.map((ol: any) => (
                              <tr key={ol.id}>
                                <td style={{ fontWeight: 700 }}>{ol.title}</td>
                                <td>{ol.first_name} {ol.father_name}</td>
                                <td style={{ color: '#DC2626', fontWeight: 700 }}>
                                  {new Date(ol.due_date).toLocaleDateString()}
                                </td>
                                <td>
                                  <button
                                    className="sh-btn sh-btn-sm sh-btn-success"
                                    onClick={() => handleReturnBook(ol.id)}
                                  >
                                    Return
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="sh-table-empty">
                                ✓ No overdue library items!
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: CATALOG */}
            {activeTab === 'catalog' && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Library Book Catalog</h2>
                    <p className="sh-page-desc">Comprehensive list of textbooks, references, and literary works</p>
                  </div>
                  <button className="sh-btn sh-btn-primary" onClick={() => setAddBookModalOpen(true)}>
                    + Add New Book
                  </button>
                </div>

                {/* Filter */}
                <div className="sh-filter-bar">
                  <input
                    type="text"
                    className="sh-input"
                    placeholder="Search by title, author, or ISBN..."
                    style={{ width: '320px' }}
                    value={bookSearch}
                    onChange={(e) => setBookSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadBooks()}
                  />
                  <select
                    className="sh-select"
                    style={{ width: '220px' }}
                    value={selectedCategory || ''}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : undefined;
                      setSelectedCategory(val);
                    }}
                  >
                    <option value="">All Categories</option>
                    <option value="1">Science & Nature</option>
                    <option value="2">Mathematics</option>
                    <option value="3">Literature & Languages</option>
                    <option value="4">Social Studies & History</option>
                    <option value="5">Technology & Computing</option>
                  </select>
                  <button className="sh-btn sh-btn-secondary" onClick={loadBooks}>
                    Filter
                  </button>
                </div>

                <div className="sh-panel">
                  <div className="sh-table-container">
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th>Book ID</th>
                          <th>Title</th>
                          <th>Author</th>
                          <th>Category</th>
                          <th>ISBN</th>
                          <th>Total Copies</th>
                          <th>Available</th>
                          <th>Shelf Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {booksList.length > 0 ? (
                          booksList.map((b) => (
                            <tr key={b.id}>
                              <td>#{b.id}</td>
                              <td style={{ fontWeight: 700, color: '#1E3A8A' }}>{b.title}</td>
                              <td>{b.author}</td>
                              <td>
                                <span className="sh-badge sh-badge-purple">{b.category_name}</span>
                              </td>
                              <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{b.isbn || 'N/A'}</td>
                              <td style={{ fontWeight: 700 }}>{b.total_copies}</td>
                              <td>
                                <span
                                  className={`sh-badge ${
                                    b.available_copies > 0 ? 'sh-badge-emerald' : 'sh-badge-rose'
                                  }`}
                                >
                                  {b.available_copies} available
                                </span>
                              </td>
                              <td>{b.shelf_location || 'General Stacks'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="sh-table-empty">
                              No books found matching criteria in MySQL.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: LOANS */}
            {activeTab === 'loans' && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Borrowing & Circulation Records</h2>
                    <p className="sh-page-desc">Track active loans, returns, and overdue dates</p>
                  </div>
                  <button className="sh-btn sh-btn-primary" onClick={() => setIssueLoanModalOpen(true)}>
                    + Issue Book Loan
                  </button>
                </div>

                <div className="sh-filter-bar">
                  <select
                    className="sh-select"
                    style={{ width: '200px' }}
                    value={loanStatusFilter}
                    onChange={(e) => {
                      setLoanStatusFilter(e.target.value);
                    }}
                  >
                    <option value="">All Loan Statuses</option>
                    <option value="borrowed">Active (Borrowed)</option>
                    <option value="overdue">Overdue</option>
                    <option value="returned">Returned</option>
                  </select>
                  <button className="sh-btn sh-btn-secondary" onClick={loadLoans}>
                    Apply Filter
                  </button>
                </div>

                <div className="sh-panel">
                  <div className="sh-table-container">
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th>Loan ID</th>
                          <th>Book Title</th>
                          <th>Copy Barcode</th>
                          <th>Student Name</th>
                          <th>Admission No</th>
                          <th>Issue Date</th>
                          <th>Due Date</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loansList.length > 0 ? (
                          loansList.map((l) => (
                            <tr key={l.id}>
                              <td>#{l.id}</td>
                              <td style={{ fontWeight: 700 }}>{l.title}</td>
                              <td style={{ fontFamily: 'monospace' }}>{l.barcode || `BC-${l.book_copy_id}`}</td>
                              <td>{l.first_name} {l.father_name}</td>
                              <td>{l.admission_no}</td>
                              <td>{new Date(l.issue_date).toLocaleDateString()}</td>
                              <td style={{ fontWeight: 600 }}>{new Date(l.due_date).toLocaleDateString()}</td>
                              <td>
                                <span
                                  className={`sh-badge ${
                                    l.status === 'borrowed'
                                      ? 'sh-badge-blue'
                                      : l.status === 'overdue'
                                      ? 'sh-badge-rose'
                                      : 'sh-badge-emerald'
                                  }`}
                                >
                                  {l.status}
                                </span>
                              </td>
                              <td>
                                {l.status !== 'returned' ? (
                                  <button
                                    className="sh-btn sh-btn-sm sh-btn-success"
                                    onClick={() => handleReturnBook(l.id)}
                                  >
                                    Return Book
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '12px', color: '#94A3B8' }}>Returned</span>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={9} className="sh-table-empty">
                              No loan records found in MySQL.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: RESERVATIONS */}
            {activeTab === 'reservations' && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Book Reservations & Holds</h2>
                    <p className="sh-page-desc">Pending student book requests and pickup queue</p>
                  </div>
                </div>

                <div className="sh-panel">
                  <div className="sh-table-container">
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th>Reservation ID</th>
                          <th>Book Title</th>
                          <th>Author</th>
                          <th>Student Borrower</th>
                          <th>Admission No</th>
                          <th>Reserved Date</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reservationsList.length > 0 ? (
                          reservationsList.map((r) => (
                            <tr key={r.id}>
                              <td>#{r.id}</td>
                              <td style={{ fontWeight: 700 }}>{r.title}</td>
                              <td>{r.author}</td>
                              <td>{r.first_name} {r.father_name}</td>
                              <td>{r.admission_no}</td>
                              <td>{new Date(r.created_at).toLocaleDateString()}</td>
                              <td>
                                <span className="sh-badge sh-badge-amber">{r.status}</span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="sh-table-empty">
                              No active book reservations in queue.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ADD BOOK MODAL */}
      {addBookModalOpen && (
        <div className="sh-modal-overlay">
          <div className="sh-modal">
            <div className="sh-modal-header">
              <h3>Catalog New Book</h3>
              <button className="sh-modal-close" onClick={() => setAddBookModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleAddBook}>
              <div className="sh-modal-body">
                <div className="sh-form-group">
                  <label>Book Title</label>
                  <input
                    type="text"
                    className="sh-input"
                    placeholder="e.g. Advanced Inorganic Chemistry"
                    value={newBookTitle}
                    onChange={(e) => setNewBookTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="sh-form-group">
                  <label>Author / Editor</label>
                  <input
                    type="text"
                    className="sh-input"
                    placeholder="e.g. Dr. Kifle Demissie"
                    value={newBookAuthor}
                    onChange={(e) => setNewBookAuthor(e.target.value)}
                    required
                  />
                </div>

                <div className="sh-form-group">
                  <label>Category</label>
                  <select
                    className="sh-select"
                    value={newBookCategory}
                    onChange={(e) => setNewBookCategory(Number(e.target.value))}
                  >
                    <option value={1}>Science & Nature</option>
                    <option value={2}>Mathematics</option>
                    <option value={3}>Literature & Languages</option>
                    <option value={4}>Social Studies & History</option>
                    <option value={5}>Technology & Computing</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="sh-form-group">
                    <label>ISBN (Optional)</label>
                    <input
                      type="text"
                      className="sh-input"
                      placeholder="e.g. 978-0-123456-78-9"
                      value={newBookIsbn}
                      onChange={(e) => setNewBookIsbn(e.target.value)}
                    />
                  </div>
                  <div className="sh-form-group">
                    <label>Initial Copies Count</label>
                    <input
                      type="number"
                      className="sh-input"
                      min={1}
                      max={50}
                      value={newBookCopies}
                      onChange={(e) => setNewBookCopies(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>

                <div className="sh-form-group">
                  <label>Shelf Location</label>
                  <input
                    type="text"
                    className="sh-input"
                    placeholder="e.g. Shelf C-3"
                    value={newBookShelf}
                    onChange={(e) => setNewBookShelf(e.target.value)}
                  />
                </div>
              </div>
              <div className="sh-modal-footer">
                <button
                  type="button"
                  className="sh-btn sh-btn-secondary"
                  onClick={() => setAddBookModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="sh-btn sh-btn-primary" disabled={submittingBook}>
                  {submittingBook ? 'Saving to Database...' : 'Add Book to Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ISSUE BOOK LOAN MODAL */}
      {issueLoanModalOpen && (
        <div className="sh-modal-overlay">
          <div className="sh-modal">
            <div className="sh-modal-header">
              <h3>Issue Book Loan</h3>
              <button className="sh-modal-close" onClick={() => setIssueLoanModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleIssueLoan}>
              <div className="sh-modal-body">
                <div className="sh-form-group">
                  <label>Book Physical Copy ID</label>
                  <input
                    type="number"
                    className="sh-input"
                    min={1}
                    value={issueCopyId}
                    onChange={(e) => setIssueCopyId(Number(e.target.value))}
                    required
                  />
                  <small style={{ color: '#64748B' }}>Enter physical copy barcode or ID (e.g. Copy #1 - 8 seeded)</small>
                </div>

                <div className="sh-form-group">
                  <label>Student ID</label>
                  <input
                    type="number"
                    className="sh-input"
                    min={1}
                    value={issueStudentId}
                    onChange={(e) => setIssueStudentId(Number(e.target.value))}
                    required
                  />
                  <small style={{ color: '#64748B' }}>Enrolled student ID (e.g. Student 1 is Hana Bekele)</small>
                </div>

                <div className="sh-form-group">
                  <label>Loan Due Date</label>
                  <input
                    type="date"
                    className="sh-input"
                    value={issueDueDate}
                    onChange={(e) => setIssueDueDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="sh-modal-footer">
                <button
                  type="button"
                  className="sh-btn sh-btn-secondary"
                  onClick={() => setIssueLoanModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="sh-btn sh-btn-primary" disabled={submittingLoan}>
                  {submittingLoan ? 'Processing Loan...' : 'Issue Book Loan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
