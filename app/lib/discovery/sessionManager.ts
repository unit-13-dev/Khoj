import { db } from '@/app/db/db';
import { planningSessions, discoveredPlaces } from '@/app/db/schema';
import { eq, and } from 'drizzle-orm';

interface SessionData {
  destination: string;
  destinationImage?: string;
  days?: number;
  startDate?: Date;
  endDate?: Date;
  interests: string[];
  mustVisitPlaces?: string[];
}

export async function createSession(userId: string, data: SessionData) {
  const [session] = await db.insert(planningSessions).values({
    userId,
    destination: data.destination,
    destinationImage: data.destinationImage,
    days: data.days,
    startDate: data.startDate,
    endDate: data.endDate,
    interests: data.interests,
    mustVisitPlaces: data.mustVisitPlaces || [],
    status: 'gathering_info',
    approvedPlaces: [],
    rejectedPlaces: []
  }).returning();

  return session;
}

export async function getSession(sessionId: string) {
  const [session] = await db
    .select()
    .from(planningSessions)
    .where(eq(planningSessions.id, sessionId))
    .limit(1);

  return session;
}

export async function getUserActiveSession(userId: string) {
  const [session] = await db
    .select()
    .from(planningSessions)
    .where(
      and(
        eq(planningSessions.userId, userId),
        eq(planningSessions.status, 'gathering_info')
      )
    )
    .orderBy(planningSessions.createdAt)
    .limit(1);

  return session;
}

export async function updateSession(sessionId: string, updates: Partial<SessionData> & { status?: string; title?: string; destinationImage?: string; conversationHistory?: any }) {
  const [updated] = await db
    .update(planningSessions)
    .set({
      ...updates,
      updatedAt: new Date()
    })
    .where(eq(planningSessions.id, sessionId))
    .returning();

  return updated;
}

export async function addApprovedPlace(sessionId: string, placeId: string) {
  const session = await getSession(sessionId);
  if (!session) return null;

  const approvedPlaces = [...(session.approvedPlaces || []), placeId];
  const rejectedPlaces = (session.rejectedPlaces || []).filter(id => id !== placeId);

  return updateSession(sessionId, {
    approvedPlaces,
    rejectedPlaces
  } as any);
}

export async function addRejectedPlace(sessionId: string, placeId: string) {
  const session = await getSession(sessionId);
  if (!session) return null;

  const rejectedPlaces = [...(session.rejectedPlaces || []), placeId];
  const approvedPlaces = (session.approvedPlaces || []).filter(id => id !== placeId);

  return updateSession(sessionId, {
    approvedPlaces,
    rejectedPlaces
  } as any);
}

export async function removePlace(sessionId: string, placeId: string) {
  const session = await getSession(sessionId);
  if (!session) return null;

  const approvedPlaces = (session.approvedPlaces || []).filter(id => id !== placeId);
  const rejectedPlaces = (session.rejectedPlaces || []).filter(id => id !== placeId);

  return updateSession(sessionId, {
    approvedPlaces,
    rejectedPlaces
  } as any);
}

export async function saveDiscoveredPlaces(sessionId: string, places: any[]) {
  const values = places.map(place => ({
    sessionId,
    placeId: place.placeId,
    placeName: place.placeName,
    placeType: place.placeType,
    rating: place.rating,
    source: place.source,
    lat: place.lat,
    lng: place.lng,
    formattedAddress: place.formattedAddress,
    relevanceScore: Math.round(place.relevanceScore), // Round to integer
    status: 'suggested'
  }));

  if (values.length === 0) return [];

  return db.insert(discoveredPlaces).values(values).returning();
}

export async function getSessionPlaces(sessionId: string) {
  return db
    .select()
    .from(discoveredPlaces)
    .where(eq(discoveredPlaces.sessionId, sessionId))
    .orderBy(discoveredPlaces.relevanceScore);
}

export async function finalizeSession(sessionId: string, itinerary?: any) {
  const [updated] = await db
    .update(planningSessions)
    .set({
      status: 'finalized',
      finalizedItinerary: itinerary,
      finalizedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(planningSessions.id, sessionId))
    .returning();

  return updated;
}

export async function getUserAllSessions(userId: string) {
  const sessions = await db
    .select()
    .from(planningSessions)
    .where(eq(planningSessions.userId, userId))
    .orderBy(planningSessions.updatedAt);

  return sessions;
}
