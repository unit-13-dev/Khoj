'use client';

interface SessionCardProps {
  session: {
    id: string;
    title: string;
    destination: string;
    destinationImage?: string | null;
    status: string;
    approvedPlacesCount: number;
    startDate?: Date | null;
    finalizedAt: Date | null;
    updatedAt: Date;
    previewImage?: string | null;
    itemsCount?: number;
  };
  onClick: () => void;
}

export default function SessionCard({ session, onClick }: SessionCardProps) {
  const isFinalized = session.status === 'finalized';
  
  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return formatDate(date);
  };

  const getStatusText = () => {
    if (isFinalized) {
      if (session.startDate) {
        return `Upcoming trip starting soon on ${formatDate(session.startDate)}`;
      }
      return 'Upcoming trip - planned whenever you\'re ready';
    }
    return session.approvedPlacesCount > 0 
      ? `${session.approvedPlacesCount} places selected`
      : 'Just started';
  };

  // Use destination image or preview image
  const cardImage = session.destinationImage || session.previewImage;

  return (
    <div
      onClick={onClick}
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(10px)',
        border: isFinalized ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative',
        height: '320px',
        display: 'flex',
        flexDirection: 'column'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        e.currentTarget.style.borderColor = isFinalized 
          ? 'rgba(74, 222, 128, 0.5)'
          : 'rgba(255, 255, 255, 0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
        e.currentTarget.style.borderColor = isFinalized 
          ? 'rgba(74, 222, 128, 0.3)'
          : 'rgba(255, 255, 255, 0.1)';
      }}
    >
      {/* Preview Image / Gradient */}
      <div
        style={{
          height: '180px',
          backgroundImage: cardImage
            ? `linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.8)), url(${cardImage})`
            : 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '16px',
          position: 'relative'
        }}
      >
        {/* Status Badge - Only for finalized */}
        {isFinalized && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                background: 'rgba(74, 222, 128, 0.15)',
                border: '1px solid rgba(74, 222, 128, 0.3)',
                color: '#4ade80',
                backdropFilter: 'blur(10px)'
              }}
            >
              ✓ Finalized
            </div>
          </div>
        )}

        {/* Destination */}
        <div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>
            {session.destination}
          </div>
          {isFinalized && session.itemsCount > 0 && (
            <div style={{ fontSize: '14px', color: '#fff', opacity: 0.9 }}>
              {session.itemsCount} stops planned
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px', color: '#fff' }}>
            {session.title}
          </div>
          
          <div style={{ fontSize: '13px', color: '#888', lineHeight: '1.5' }}>
            {getStatusText()}
            {!isFinalized && (
              <span> • Updated {getTimeAgo(session.updatedAt)}</span>
            )}
          </div>
        </div>

        {/* Action hint */}
        <div
          style={{
            fontSize: '12px',
            fontWeight: '500',
            color: 'rgba(255, 255, 255, 0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          {isFinalized ? 'View Itinerary' : 'Continue Planning'} →
        </div>
      </div>
    </div>
  );
}
