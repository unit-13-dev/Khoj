import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSession, finalizeSession } from '@/app/lib/discovery/sessionManager';
import { db } from '@/app/db/db';
import { discoveredPlaces } from '@/app/db/schema';
import { inArray, eq } from 'drizzle-orm';
import { generateSmartSchedule } from '@/app/lib/itinerary/smartScheduler';
import client from '@/app/lib/googlePlaces/client';

export async function POST(req: NextRequest) {
  try {
    console.log('=== FINALIZE ENDPOINT: START ===');
    
    const { userId } = await auth();
    if (!userId) {
      console.error('FINALIZE: No userId - unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('FINALIZE: UserId:', userId);

    const { sessionId } = await req.json();
    console.log('FINALIZE: SessionId from request:', sessionId);
    
    if (!sessionId) {
      console.error('FINALIZE: No sessionId provided');
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    const session = await getSession(sessionId);
    console.log('FINALIZE: Session found:', !!session);
    console.log('FINALIZE: Session data:', session);
    
    if (!session || session.userId !== userId) {
      console.error('FINALIZE: Session not found or unauthorized');
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    console.log('FINALIZE: Approved places:', session.approvedPlaces);
    console.log('FINALIZE: Approved places count:', session.approvedPlaces?.length);
    
    if (!session.approvedPlaces || session.approvedPlaces.length === 0) {
      console.error('FINALIZE: No places selected');
      return NextResponse.json({ error: 'No places selected' }, { status: 400 });
    }

    // Fetch place details for approved places from discovered_places table
    console.log('FINALIZE: Fetching place details from discovered_places table...');
    const approvedPlaceDetails = await db
      .select()
      .from(discoveredPlaces)
      .where(
        inArray(discoveredPlaces.placeId, session.approvedPlaces)
      );

    console.log('FINALIZE: Place details fetched (with duplicates):', approvedPlaceDetails.length);
    
    // Deduplicate places by placeId (keep first occurrence)
    const uniquePlaces = new Map();
    approvedPlaceDetails.forEach(place => {
      if (!uniquePlaces.has(place.placeId)) {
        uniquePlaces.set(place.placeId, place);
      }
    });
    
    const deduplicatedPlaces = Array.from(uniquePlaces.values());
    console.log('FINALIZE: Place details after deduplication:', deduplicatedPlaces.length);
    console.log('FINALIZE: Place details:', deduplicatedPlaces.map(p => ({ id: p.placeId, name: p.placeName })));
    
    if (deduplicatedPlaces.length === 0) {
      console.error('FINALIZE: No place details found in discovered_places table');
      return NextResponse.json({ 
        error: 'Place details not found. Please try discovering places again.' 
      }, { status: 404 });
    }

    // Transform to match expected format
    const placesForScheduling = deduplicatedPlaces.map(p => ({
      placeId: p.placeId,
      displayName: p.placeName,
      type: p.placeType || 'tourist_attraction',
      lat: p.lat || 0,
      lng: p.lng || 0,
      formattedAddress: p.formattedAddress || ''
    }));

    // Use smart scheduler to generate time-based itinerary
    console.log('FINALIZE: Generating smart schedule...');
    const days = session.days || 3; // Default to 3 days if not specified
    const startDate = session.startDate || undefined;
    
    const daySchedules = generateSmartSchedule(placesForScheduling, days, startDate);
    console.log('FINALIZE: Smart schedule generated:', daySchedules.length, 'days');

    // Fetch photos for all places
    console.log('FINALIZE: Fetching photos for all places...');
    const placesWithPhotos = await Promise.all(
      placesForScheduling.map(async (place) => {
        let photoUrl = null;
        try {
          const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
          const [placeDetails] = await client.getPlace({
            name: `places/${place.placeId}`
          }, {
            otherArgs: {
              headers: {
                'X-Goog-FieldMask': 'photos'
              }
            }
          });
          
          if (placeDetails?.photos?.[0]?.name) {
            const photoName = placeDetails.photos[0].name;
            const requestUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&maxWidthPx=400&key=${apiKey}`;
            const res = await fetch(requestUrl);
            photoUrl = res.url;
          }
        } catch (error) {
          console.error(`Failed to fetch photo for ${place.displayName}:`, error);
        }
        
        return { ...place, photoUrl };
      })
    );
    
    // Add photos to scheduled places
    const daySchedulesWithPhotos = daySchedules.map(daySchedule => ({
      ...daySchedule,
      places: daySchedule.places.map(scheduledPlace => {
        const placeWithPhoto = placesWithPhotos.find(p => p.placeId === scheduledPlace.place.placeId);
        return {
          ...scheduledPlace,
          photoUrl: placeWithPhoto?.photoUrl || null
        };
      })
    }));

    console.log('FINALIZE: Photos fetched and added');

    const responseData = {
      success: true,
      itinerary: {
        sessionId: session.id,
        title: session.title,
        destination: session.destination,
        days: days,
        startDate: startDate,
        daySchedules: daySchedulesWithPhotos,
        totalPlaces: placesForScheduling.length,
        finalizedAt: new Date()
      }
    };

    // Save the finalized itinerary to database
    console.log('FINALIZE: Saving itinerary to database...');
    await finalizeSession(sessionId, responseData.itinerary);
    console.log('FINALIZE: Itinerary saved to database');

    console.log('=== FINALIZE: Sending response ===');
    console.log('FINALIZE: Response structure:', {
      success: responseData.success,
      itinerary: {
        ...responseData.itinerary,
        daySchedules: `${responseData.itinerary.daySchedules.length} days`
      }
    });

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('=== FINALIZE: ERROR ===');
    console.error('FINALIZE: Error details:', error);
    console.error('FINALIZE: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Failed to finalize itinerary', details: String(error) },
      { status: 500 }
    );
  }
}
