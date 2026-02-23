import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/app/db/db';
import { sql } from 'drizzle-orm';
import { optimizeRoute } from '@/app/lib/route/tsp';

const VISIT_DURATIONS: Record<string, number> = {
  restaurant: 60,
  cafe: 30,
  museum: 90,
  park: 60,
  shopping_mall: 90,
  tourist_attraction: 45,
  default: 45
};

async function getGoogleDirections(origin: {lat: number, lng: number}, destination: {lat: number, lng: number}, mode: string) {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&mode=${mode}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.status === 'OK' && data.routes[0]) {
    const leg = data.routes[0].legs[0];
    return {
      distance: leg.distance.value,
      duration: Math.ceil(leg.duration.value / 60),
      mode: mode
    };
  }
  
  return null;
}

async function getAllTransportOptions(origin: {lat: number, lng: number}, destination: {lat: number, lng: number}) {
  const modes = ['driving', 'walking', 'transit', 'bicycling'];
  const options = await Promise.all(
    modes.map(async (mode) => {
      const result = await getGoogleDirections(origin, destination, mode);
      return result ? { ...result, mode } : null;
    })
  );
  
  return options.filter(opt => opt !== null);
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { placeIds, startTime, transportMode } = await req.json();

    if (!placeIds || placeIds.length < 2) {
      return NextResponse.json({ error: 'Select at least 2 places' }, { status: 400 });
    }

    if (placeIds.length > 8) {
      return NextResponse.json({ error: 'Maximum 8 places allowed' }, { status: 400 });
    }

    const mode = transportMode || 'driving';

    // Fetch place details
    const places = await db.execute(sql`
      SELECT place_id, display_name, lat, lng, type
      FROM places
      WHERE place_id = ANY(${sql.raw(`ARRAY[${placeIds.map((id: string) => `'${id}'`).join(',')}]`)})
    `);

    // Build distance matrix
    const distanceMatrix: Record<string, Record<string, number>> = {};
    for (const p1 of places.rows) {
      distanceMatrix[p1.place_id as string] = {};
      for (const p2 of places.rows) {
        if (p1.place_id === p2.place_id) {
          distanceMatrix[p1.place_id as string][p2.place_id as string] = 0;
        } else {
          const result = await db.execute(sql`
            SELECT ST_Distance(
              (SELECT location FROM places WHERE place_id = ${p1.place_id}),
              (SELECT location FROM places WHERE place_id = ${p2.place_id}),
              true
            ) as distance
          `);
          distanceMatrix[p1.place_id as string][p2.place_id as string] = result.rows[0]?.distance as number || 0;
        }
      }
    }

    // Optimize route
    const optimizedOrder = optimizeRoute(placeIds, distanceMatrix);

    // Generate timeline with Google Directions
    const timeline = [];
    let currentTime = startTime || '09:00';
    let totalDistance = 0;

    for (let i = 0; i < optimizedOrder.length; i++) {
      const placeId = optimizedOrder[i];
      const place = places.rows.find((p: any) => p.place_id === placeId);
      const visitDuration = VISIT_DURATIONS[place?.type as string] || VISIT_DURATIONS.default;

      timeline.push({
        type: 'visit',
        placeId: place?.place_id,
        placeName: place?.display_name,
        arrivalTime: currentTime,
        departureTime: addMinutes(currentTime, visitDuration),
        visitDuration,
        placeType: place?.type
      });

      currentTime = addMinutes(currentTime, visitDuration);

      if (i < optimizedOrder.length - 1) {
        const nextPlaceId = optimizedOrder[i + 1];
        const nextPlace = places.rows.find((p: any) => p.place_id === nextPlaceId);
        
        const transportOptions = await getAllTransportOptions(
          { lat: place?.lat as number, lng: place?.lng as number },
          { lat: nextPlace?.lat as number, lng: nextPlace?.lng as number }
        );

        if (transportOptions.length > 0) {
          const defaultOption = transportOptions.find(opt => opt.mode === mode) || transportOptions[0];
          totalDistance += defaultOption.distance;

          timeline.push({
            type: 'travel',
            distance: defaultOption.distance,
            duration: defaultOption.duration,
            mode: defaultOption.mode,
            startTime: currentTime,
            endTime: addMinutes(currentTime, defaultOption.duration),
            options: transportOptions
          });

          currentTime = addMinutes(currentTime, defaultOption.duration + 5);
        }
      }
    }

    const totalTime = calculateTotalMinutes(startTime || '09:00', currentTime);

    return NextResponse.json({
      route: optimizedOrder,
      timeline,
      totalDistance: Math.round(totalDistance),
      totalTime,
      endTime: currentTime,
      transportMode: mode
    });

  } catch (error) {
    console.error('Error generating itinerary:', error);
    return NextResponse.json({ error: 'Failed to generate itinerary' }, { status: 500 });
  }
}

function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const totalMins = hours * 60 + mins + minutes;
  const newHours = Math.floor(totalMins / 60) % 24;
  const newMins = totalMins % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

function calculateTotalMinutes(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  return (endH * 60 + endM) - (startH * 60 + startM);
}
