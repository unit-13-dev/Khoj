import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSession, createSession } from '@/app/lib/discovery/sessionManager';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    const session = await getSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Verify the session belongs to the user
    if (session.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({
      id: session.id,
      title: session.title,
      destination: session.destination,
      days: session.days,
      startDate: session.startDate,
      endDate: session.endDate,
      interests: session.interests,
      status: session.status,
      conversationHistory: session.conversationHistory,
      approvedPlaces: session.approvedPlaces,
      rejectedPlaces: session.rejectedPlaces,
      finalizedItinerary: session.finalizedItinerary,
      finalizedAt: session.finalizedAt,
      createdAt: session.createdAt
    });

  } catch (error) {
    console.error('Session fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { destination = 'New Trip', interests = [] } = body;

    const session = await createSession(userId, {
      destination,
      interests
    });

    return NextResponse.json({
      sessionId: session.id,
      success: true
    });

  } catch (error) {
    console.error('Session creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
