interface TeacherNotFoundProps {
  onGoHome: () => void;
}

export default function TeacherNotFound({ onGoHome }: TeacherNotFoundProps) {
  return (
    <div style={{
      padding: '60px 24px',
      textAlign: 'center',
      background: '#FFFFFF',
      borderRadius: '16px',
      border: '1px solid #E2E8F0',
      maxWidth: '560px',
      margin: '40px auto',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
    }}>
      <div style={{ fontSize: '56px', marginBottom: '16px' }}>🔍</div>
      <div style={{
        display: 'inline-block',
        padding: '4px 12px',
        background: '#FEF2F2',
        color: '#DC2626',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.5px',
        marginBottom: '12px'
      }}>
        404 NOT FOUND
      </div>
      <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#1F3A5F', margin: '0 0 8px' }}>
        Teacher Page Not Found
      </h2>
      <p style={{ color: '#64748B', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
        The route <code>{window.location.pathname}</code> does not exist within the Teacher Portal. Please verify the URL or select one of the authorized navigation links from the sidebar menu.
      </p>
      <button
        type="button"
        className="btn-primary"
        onClick={onGoHome}
        style={{ margin: '0 auto', padding: '10px 24px', fontSize: '14px' }}
      >
        &larr; Return to Teacher Dashboard
      </button>
    </div>
  );
}
