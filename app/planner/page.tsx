'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import SessionCard from '@/app/components/SessionCard';
import NewTripCard from '@/app/components/NewTripCard';

interface Session {
  id: string;
  title: string;
  destination: string;
  destinationImage?: string | null;
  status: string;
  approvedPlacesCount: number;
  startDate?: Date | null;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  previewImage?: string | null;
  itemsCount?: number;
}

export default function PlannerHomePage() {
  const { user, isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingSession, setCreatingSession] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/auth');
      return;
    }

    if (isLoaded && isSignedIn) {
      fetchSessions();
    }
  }, [isLoaded, isSignedIn, router]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/planner/sessions');
      setSessions(response.data.sessions);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartNewTrip = async () => {
    if (creatingSession) return;
    
    try {
      setCreatingSession(true);
      // Create a new session
      const response = await axios.post('/api/planner/session', {
        userId: user?.id,
        destination: 'New Trip',
        interests: []
      });
      
      // Navigate to the new session
      router.push(`/planner/${response.data.sessionId}`);
    } catch (error) {
      console.error('Failed to create session:', error);
      setCreatingSession(false);
    }
  };

  const handleSessionClick = (sessionId: string) => {
    router.push(`/planner/${sessionId}`);
  };

  if (!isLoaded || !isSignedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#000' }}>
        <div style={{ color: '#fff' }}>Loading...</div>
      </div>
    );
  }

  const finalizedSessions = sessions.filter(s => s.status === 'finalized');
  const inProgressSessions = sessions.filter(s => s.status !== 'finalized');

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #333', padding: '24px 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>
            Trip Planner
          </h1>
          <p style={{ fontSize: '16px', color: '#888' }}>
            Plan your perfect journey with AI assistance
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 24px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <div style={{ color: '#888' }}>Loading your trips...</div>
          </div>
        ) : (
          <>
            {/* New Trip Card */}
            <div style={{ marginBottom: '48px' }}>
              <NewTripCard onClick={handleStartNewTrip} />
            </div>

            {/* Empty State */}
            {sessions.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                <div style={{ fontSize: '64px', marginBottom: '24px', opacity: 0.5 }}>
                  ✈️
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px' }}>
                  No trips yet
                </div>
                <div style={{ fontSize: '16px', color: '#888' }}>
                  Start planning your first adventure by clicking the card above
                </div>
              </div>
            )}

            {/* Finalized Trips */}
            {finalizedSessions.length > 0 && (
              <div style={{ marginBottom: '48px' }}>
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
                    Your Upcoming Trips
                  </h2>
                  <p style={{ fontSize: '14px', color: '#888' }}>
                    Ready to go • {finalizedSessions.length} {finalizedSessions.length === 1 ? 'trip' : 'trips'}
                  </p>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '24px'
                  }}
                >
                  {finalizedSessions.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onClick={() => handleSessionClick(session.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* In-Progress Planning */}
            {inProgressSessions.length > 0 && (
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
                    Continue Planning
                  </h2>
                  <p style={{ fontSize: '14px', color: '#888' }}>
                    In progress • {inProgressSessions.length} {inProgressSessions.length === 1 ? 'trip' : 'trips'}
                  </p>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '24px'
                  }}
                >
                  {inProgressSessions.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onClick={() => handleSessionClick(session.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
