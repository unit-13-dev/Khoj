import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserAllSessions } from '@/app/lib/discovery/sessionManager';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessions = await getUserAllSessions(userId);

    // Transform sessions for frontend
    const transformedSessions = sessions.map(session => {
      const itinerary = session.finalizedItinerary as any;
      
      return {
        id: session.id,
        title: session.title || 'Trip Planning',
        destination: session.destination,
        destinationImage: session.destinationImage || itinerary?.items?.[0]?.photoUrl || null,
        status: session.status,
        approvedPlacesCount: session.approvedPlaces?.length || 0,
        startDate: session.startDate,
        finalizedAt: session.finalizedAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        previewImage: session.destinationImage || itinerary?.items?.[0]?.photoUrl || null,
        itemsCount: itinerary?.items?.length || 0
      };
    });

    // Sort: finalized first, then by updatedAt DESC
    transformedSessions.sort((a, b) => {
      if (a.status === 'finalized' && b.status !== 'finalized') return -1;
      if (a.status !== 'finalized' && b.status === 'finalized') return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return NextResponse.json({ sessions: transformedSessions });
  } catch (error) {
    console.error('Failed to fetch sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}
