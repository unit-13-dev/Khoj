import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { discoverPlaces, refineSearch, findSimilarPlaces } from '@/app/lib/discovery/placeDiscovery';
import { 
  createSession, 
  getUserActiveSession, 
  saveDiscoveredPlaces,
  addApprovedPlace,
  addRejectedPlace
} from '@/app/lib/discovery/sessionManager';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, region, interests, days, subRegion, placeId, sessionId } = body;

    if (action === 'discover') {
      let session = await getUserActiveSession(userId);
      
      if (!session) {
        session = await createSession(userId, {
          destination: region,
          days,
          interests: interests || []
        });
      }

      const excludePlaceIds = [
        ...(session.approvedPlaces || []),
        ...(session.rejectedPlaces || [])
      ];

      const places = await discoverPlaces({
        region,
        interests: interests || [],
        userId,
        limit: 30,
        excludePlaceIds
      });

      await saveDiscoveredPlaces(session.id, places);

      return NextResponse.json({
        sessionId: session.id,
        places: places.slice(0, 7),
        totalFound: places.length
      });
    }

    if (action === 'refine') {
      if (!sessionId) {
        return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
      }

      const session = await getUserActiveSession(userId);
      if (!session) {
        return NextResponse.json({ error: 'No active session' }, { status: 404 });
      }

      const excludePlaceIds = [
        ...(session.approvedPlaces || []),
        ...(session.rejectedPlaces || [])
      ];

      const places = await refineSearch({
        region,
        subRegion,
        interests: interests || [],
        userId,
        limit: 30,
        excludePlaceIds
      });

      await saveDiscoveredPlaces(session.id, places);

      return NextResponse.json({
        sessionId: session.id,
        places: places.slice(0, 7),
        totalFound: places.length
      });
    }

    if (action === 'similar') {
      if (!placeId || !region) {
        return NextResponse.json({ error: 'Place ID and region required' }, { status: 400 });
      }

      const places = await findSimilarPlaces(placeId, region, 5);

      return NextResponse.json({
        places
      });
    }

    if (action === 'approve') {
      if (!sessionId || !placeId) {
        return NextResponse.json({ error: 'Session ID and Place ID required' }, { status: 400 });
      }

      await addApprovedPlace(sessionId, placeId);

      return NextResponse.json({ success: true });
    }

    if (action === 'reject') {
      if (!sessionId || !placeId) {
        return NextResponse.json({ error: 'Session ID and Place ID required' }, { status: 400 });
      }

      await addRejectedPlace(sessionId, placeId);

      return NextResponse.json({ success: true });
    }

    if (action === 'remove') {
      if (!sessionId || !placeId) {
        return NextResponse.json({ error: 'Session ID and Place ID required' }, { status: 400 });
      }

      // Import removePlace function
      const { removePlace } = await import('@/app/lib/discovery/sessionManager');
      await removePlace(sessionId, placeId);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Discovery error:', error);
    return NextResponse.json(
      { error: 'Failed to discover places' },
      { status: 500 }
    );
  }
}
