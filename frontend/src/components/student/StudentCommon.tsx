import React from 'react';

export interface TabItem {
  key: string;
  label: string;
  badge?: number | string;
  icon?: React.ReactNode;
}

export interface StudentTabsProps {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
}

export const StudentTabs: React.FC<StudentTabsProps> = ({
  tabs,
  activeKey,
  onChange,
  ariaLabel = 'Page tabs'
}) => {
  return (
    <nav className="student-tabs-bar" role="tablist" aria-label={ariaLabel} style={{
      display: 'flex',
      gap: '8px',
      borderBottom: '2px solid #E2E8F0',
      marginBottom: '24px',
      overflowX: 'auto',
      paddingBottom: '2px'
    }}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.key}`}
            id={`tab-${tab.key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: isActive ? 700 : 500,
              fontSize: '14px',
              color: isActive ? '#1F3A5F' : '#64748B',
              borderBottom: isActive ? '3px solid #1F3A5F' : '3px solid transparent',
              marginBottom: '-3px',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.icon && <span style={{ display: 'inline-flex' }}>{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge !== null && (
              <span style={{
                background: isActive ? '#E0F2FE' : '#F1F5F9',
                color: isActive ? '#0369A1' : '#475569',
                fontSize: '12px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '999px'
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

export const StudentSpinner: React.FC<{ message?: string }> = ({
  message = 'Loading academic records from server...'
}) => (
  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
    <div
      className="spinner"
      style={{
        margin: '0 auto 16px',
        borderColor: '#1F3A5F',
        borderTopColor: 'transparent',
        width: '32px',
        height: '32px',
        borderWidth: '3px',
        borderStyle: 'solid',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }}
    />
    <p style={{ fontSize: '14px', margin: 0 }}>{message}</p>
  </div>
);

export const StudentEmptyState: React.FC<{
  icon?: string;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}> = ({ icon = '📭', title, description, action }) => (
  <div style={{
    textAlign: 'center',
    padding: '48px 24px',
    background: '#F8FAFC',
    borderRadius: '12px',
    border: '1px dashed #CBD5E1',
    margin: '16px 0'
  }}>
    <div style={{ fontSize: '42px', marginBottom: '12px' }}>{icon}</div>
    <h3 style={{ margin: '0 0 8px', color: '#1E293B', fontSize: '17px', fontWeight: 700 }}>{title}</h3>
    <p style={{ margin: '0 auto 16px', color: '#64748B', fontSize: '14px', maxWidth: '420px', lineHeight: 1.5 }}>
      {description}
    </p>
    {action && (
      <button
        type="button"
        className="btn-primary btn-sm"
        onClick={action.onClick}
        style={{
          background: '#1F3A5F',
          color: '#fff',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '6px',
          fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        {action.label}
      </button>
    )}
  </div>
);

export const StudentErrorState: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
}> = ({ title = 'Failed to load records', message, onRetry }) => (
  <div style={{
    padding: '20px',
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    borderRadius: '10px',
    color: '#991B1B',
    margin: '16px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px'
  }}>
    <div>
      <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>⚠️ {title}</div>
      <div style={{ fontSize: '13px', color: '#B91C1C' }}>{message}</div>
    </div>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        style={{
          background: '#DC2626',
          color: '#fff',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '6px',
          fontWeight: 600,
          fontSize: '13px',
          cursor: 'pointer',
          whiteSpace: 'nowrap'
        }}
      >
        Retry
      </button>
    )}
  </div>
);
