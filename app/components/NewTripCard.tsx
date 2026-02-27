'use client';

interface NewTripCardProps {
  onClick: () => void;
}

export default function NewTripCard({ onClick }: NewTripCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '20px 24px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        maxWidth: '600px',
        margin: '0 auto'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      }}
    >
      <div style={{ fontSize: '24px', opacity: 0.8 }}>💬</div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.5)',
            fontStyle: 'italic'
          }}
        >
          Start planning a new itinerary now...
        </div>
      </div>
      <div style={{ fontSize: '20px', opacity: 0.5 }}>→</div>
    </div>
  );
}
