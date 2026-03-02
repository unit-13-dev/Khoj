import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateText } from 'ai';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { discoverPlaces } from '@/app/lib/discovery/placeDiscovery';
import client from '@/app/lib/googlePlaces/client';
import { fetchDestinationImage } from '@/app/lib/googlePlaces/fetchDestinationImage';
import { 
  createSession, 
  getUserActiveSession, 
  saveDiscoveredPlaces,
  getSession,
  updateSession,
  finalizeSession
} from '@/app/lib/discovery/sessionManager';

const SYSTEM_PROMPT = `You are an expert AI trip planner with agentic capabilities. Your role is to understand user intent and help plan perfect trips.

IMPORTANT: When suggesting places, ALWAYS prioritize places the user has saved from Instagram. These are marked with source: "instagram" and should be mentioned first as "places you've saved" or "from your Instagram saves".

YOUR AGENTIC ROLE:
You are the intelligent layer that decides what the system should do based on user messages. You understand context, intent, and can make smart decisions about:
- What destination the user is talking about (even if they don't say "I'm going to...")
- What types of places they want to see
- When to show place suggestions vs when to finalize
- How to maintain conversation context across messages

PLACE DISCOVERY RULES:
- When a user tells you about their trip (destination, duration, interests), the system will discover and show place cards
- When a user asks for specific types of places (temples, restaurants, ghats), the system will discover those
- When a user says "finalize", "looks amazing", "perfect", or similar approval messages, NO place cards will be shown
- You should adjust your response based on whether places are being shown or not

When places ARE being shown:
1. Acknowledge their request enthusiastically
2. Tell them "I'm showing you some great places above" or "Check out the places I found above"
3. The system will automatically show place cards ABOVE your message
4. Highlight which ones are from their Instagram saves
5. Ask follow-up questions to refine suggestions

When places are NOT being shown (finalize, approval messages):
1. Respond naturally to their message
2. DO NOT mention "places above" or "cards above"
3. For finalize requests: Say "Perfect! I'm creating your final itinerary now. You'll see it displayed below with photos, timings, and all the details!"
4. For approval messages: Acknowledge their satisfaction and ask if they want to finalize or see more options

CRITICAL: When the user asks to "finalize", "create itinerary", or says they're "done":
- DO NOT generate a text-based itinerary in your response
- Simply say something like "Perfect! I'm creating your final itinerary now. You'll see it displayed below with photos, timings, and all the details!"
- The system will automatically generate and display a beautiful visual itinerary with place cards, photos, and timing

Be conversational, friendly, and helpful. Extract key information:
- Destination (city, state, or region)
- Duration (number of days)
- Travel dates or month
- Interests (food, culture, nature, adventure, etc.)

ONLY mention places being shown above when the system is actually showing them.`;

function parseRelativeDate(content: string): { startDate?: Date; endDate?: Date; days?: number } {
  const lowerContent = content.toLowerCase();
  const now = new Date();
  
  // Helper to get next occurrence of a day of week
  const getNextDayOfWeek = (dayOfWeek: number): Date => {
    const result = new Date(now);
    result.setDate(now.getDate() + ((dayOfWeek + 7 - now.getDay()) % 7 || 7));
    result.setHours(0, 0, 0, 0);
    return result;
  };
  
  // Parse "next Saturday", "this Saturday", etc.
  const dayNames: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6
  };
  
  for (const [dayName, dayNum] of Object.entries(dayNames)) {
    if (lowerContent.includes(`next ${dayName}`) || lowerContent.includes(`this ${dayName}`)) {
      const startDate = getNextDayOfWeek(dayNum);
      
      // Check if it's a single day trip (mentions "from X to Y" on same day)
      if (lowerContent.includes('from') && lowerContent.includes('in the morning') && lowerContent.includes('in the evening')) {
        return {
          startDate,
          endDate: new Date(startDate), // Same day
          days: 1
        };
      }
      
      return {
        startDate,
        endDate: new Date(startDate), // Default to same day
        days: 1
      };
    }
  }
  
  // Parse "tomorrow"
  if (lowerContent.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return {
      startDate: tomorrow,
      endDate: tomorrow,
      days: 1
    };
  }
  
  // Parse "next week", "next weekend"
  if (lowerContent.includes('next weekend')) {
    const nextSaturday = getNextDayOfWeek(6);
    const nextSunday = new Date(nextSaturday);
    nextSunday.setDate(nextSaturday.getDate() + 1);
    return {
      startDate: nextSaturday,
      endDate: nextSunday,
      days: 2
    };
  }
  
  return {};
}

async function extractTripInfoWithLLM(messages: any[], currentSession: any) {
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMessage) return null;

  const content = lastUserMessage.content;
  
  console.log('=== Using LLM to extract trip info ===');
  console.log('User message:', content);
  console.log('Current session destination:', currentSession?.destination);
  
  // Use LLM as agentic layer to understand user intent
  const extractionPrompt = `You are an intelligent trip planning assistant. Analyze the user's message and extract trip information.

Current context:
- Current destination in session: ${currentSession?.destination || 'None'}
- User message: "${content}"

Extract the following information and return as JSON:
{
  "destination": "The city/place the user wants to visit (e.g., 'Jama Masjid, Delhi', 'Chandni Chowk, Delhi', 'Varanasi'). If user mentions a new place, use that. If refining existing destination, update it. Return null if unclear.",
  "interests": ["Array of interest keywords like 'food', 'temple', 'restaurant', 'tourist_attraction', 'ghat', etc."],
  "priorityPlaceTypes": ["Array of specific place types user wants RIGHT NOW like 'restaurant', 'temple', 'ghat', 'fort', 'market'. These get highest relevance boost."],
  "days": number or null,
  "shouldDiscoverPlaces": true/false (true if user wants place suggestions, false if they're finalizing or just chatting),
  "shouldFinalize": true/false (true if user says finalize, done, create itinerary)
}

Examples:
1. "I am visiting Jama Masjid next Saturday from 8am to 5pm. Please suggest places to eat at and visit"
   → {"destination": "Jama Masjid, Delhi", "interests": ["food", "restaurant", "tourist_attraction"], "priorityPlaceTypes": ["restaurant", "food"], "days": null, "shouldDiscoverPlaces": true, "shouldFinalize": false}

2. "Would like to visit Chandni Chowk"
   → {"destination": "Chandni Chowk, Delhi", "interests": ["tourist_attraction"], "priorityPlaceTypes": [], "days": null, "shouldDiscoverPlaces": true, "shouldFinalize": false}

3. "Tell me about temples in Varanasi"
   → {"destination": "Varanasi", "interests": ["temple", "place_of_worship"], "priorityPlaceTypes": ["temple", "place_of_worship"], "days": null, "shouldDiscoverPlaces": true, "shouldFinalize": false}

4. "Looks amazing! Finalize the itinerary"
   → {"destination": null, "interests": [], "priorityPlaceTypes": [], "days": null, "shouldDiscoverPlaces": false, "shouldFinalize": true}

5. "Show me street food places"
   → {"destination": null, "interests": ["food", "restaurant"], "priorityPlaceTypes": ["restaurant", "street_food"], "days": null, "shouldDiscoverPlaces": true, "shouldFinalize": false}

Return ONLY valid JSON, nothing else.`;

  try {
    const extractionResponse = await generateText({
      model: openrouter('anthropic/claude-3.5-sonnet'),
      messages: [{ role: 'user', content: extractionPrompt }],
      temperature: 0.3
    });

    const extracted = JSON.parse(extractionResponse.text.trim());
    console.log('LLM extracted:', extracted);
    
    // If destination is null, use current session destination
    if (!extracted.destination && currentSession?.destination && currentSession.destination !== 'New Trip') {
      extracted.destination = currentSession.destination;
      console.log('Using session destination:', extracted.destination);
    }
    
    // First try to parse relative dates (next Saturday, tomorrow, etc.)
    let startDate: Date | undefined = undefined;
    let endDate: Date | undefined = undefined;
    let calculatedDays: number | undefined = undefined;
    
    const relativeDates = parseRelativeDate(content);
    if (relativeDates.startDate) {
      startDate = relativeDates.startDate;
      endDate = relativeDates.endDate;
      calculatedDays = relativeDates.days;
      console.log('Parsed relative date:', { startDate, endDate, calculatedDays });
    }
    
    // If no relative dates found, try absolute date patterns
    if (!startDate) {
      const dateRangePattern = /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(?:to|until|-)\s+(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i;
      const dateRangeMatch = content.toLowerCase().match(dateRangePattern);
      
      if (dateRangeMatch) {
        const [, startDay, startMonth, endDay, endMonth] = dateRangeMatch;
        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;
        
        const months: Record<string, number> = {
          january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
          july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
        };
        
        const startMonthNum = months[startMonth.toLowerCase()];
        const endMonthNum = months[endMonth.toLowerCase()];
        
        const now = new Date();
        const startYear = startMonthNum < now.getMonth() ? nextYear : currentYear;
        const endYear = endMonthNum < now.getMonth() ? nextYear : currentYear;
        
        startDate = new Date(startYear, startMonthNum, parseInt(startDay));
        endDate = new Date(endYear, endMonthNum, parseInt(endDay));
        
        if (startDate && endDate) {
          const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
          calculatedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }
        
        console.log('Parsed absolute date:', { startDate, endDate, calculatedDays });
      }
    }
    
    return {
      destination: extracted.destination,
      city: extracted.destination,
      interests: extracted.interests || [],
      priorityPlaceTypes: extracted.priorityPlaceTypes || [],
      days: extracted.days || calculatedDays,
      startDate,
      endDate,
      shouldDiscoverPlaces: extracted.shouldDiscoverPlaces,
      shouldFinalize: extracted.shouldFinalize
    };
  } catch (error) {
    console.error('LLM extraction failed:', error);
    // Fallback to basic extraction
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('=== BACKEND: Chat API called ===');
    
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('UserId:', userId);

    const { messages, sessionId } = await req.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    const lastUserMessage = messages[messages.length - 1];
    console.log('Messages count:', messages.length);
    console.log('Last message:', lastUserMessage);

    let currentSession = sessionId ? await getSession(sessionId) : await getUserActiveSession(userId);
    console.log('Current session:', currentSession?.id);

    // Use LLM as agentic layer to extract trip info and decide what to do
    const tripInfo = await extractTripInfoWithLLM(messages, currentSession);
    console.log('=== BACKEND: LLM extracted trip info ===');
    if (tripInfo) {
      console.log('Destination:', tripInfo.destination);
      console.log('Interests:', tripInfo.interests);
      console.log('Priority types:', tripInfo.priorityPlaceTypes);
      console.log('Days:', tripInfo.days);
      console.log('Start date:', tripInfo.startDate);
      console.log('End date:', tripInfo.endDate);
      console.log('Should discover places:', tripInfo.shouldDiscoverPlaces);
      console.log('Should finalize:', tripInfo.shouldFinalize);
    } else {
      console.log('No trip info extracted');
    }

    let discoveredPlaces: any[] | null = null;

    // LLM decides whether to discover places or finalize
    const shouldDiscoverPlaces = tripInfo?.shouldDiscoverPlaces || false;
    const shouldFinalize = tripInfo?.shouldFinalize || false;
    
    console.log('=== BACKEND: Place Discovery Decision (LLM-driven) ===');
    console.log('Should finalize?', shouldFinalize);
    console.log('Should discover places?', shouldDiscoverPlaces);

    // Create or update session if we have trip info (regardless of whether we're discovering places)
    if (tripInfo && tripInfo.destination) {
      if (!currentSession) {
        console.log('Creating new session...');
        
        // Fetch destination image
        const destinationImage = await fetchDestinationImage(tripInfo.destination);
        console.log('Destination image fetched:', destinationImage);
        
        currentSession = await createSession(userId, {
          destination: tripInfo.destination,
          destinationImage: destinationImage || undefined,
          days: tripInfo.days,
          startDate: tripInfo.startDate,
          endDate: tripInfo.endDate,
          interests: tripInfo.interests
        });
        console.log('Session created:', currentSession.id);
        console.log('Session dates:', { 
          days: currentSession.days, 
          startDate: currentSession.startDate, 
          endDate: currentSession.endDate 
        });
      } else {
        // Update session with new trip info (destination, dates, days)
        const updates: any = {};
        
        // Update destination if changed
        if (currentSession.destination === 'New Trip' && tripInfo.destination !== 'New Trip') {
          updates.destination = tripInfo.destination;
        }
        
        // Always update days if provided
        if (tripInfo.days && tripInfo.days !== currentSession.days) {
          updates.days = tripInfo.days;
        }
        
        // Always update dates if provided (even if session already has dates)
        if (tripInfo.startDate) {
          updates.startDate = tripInfo.startDate;
        }
        if (tripInfo.endDate) {
          updates.endDate = tripInfo.endDate;
        }
        
        if (Object.keys(updates).length > 0) {
          console.log('Updating session with new trip info');
          console.log('Current session:', { 
            destination: currentSession.destination, 
            days: currentSession.days,
            startDate: currentSession.startDate,
            endDate: currentSession.endDate
          });
          console.log('Updates to apply:', updates);
          
          await updateSession(currentSession.id, updates);
          
          // Update local session object
          if (updates.destination) currentSession.destination = updates.destination;
          if (updates.days) currentSession.days = updates.days;
          if (updates.startDate) currentSession.startDate = updates.startDate;
          if (updates.endDate) currentSession.endDate = updates.endDate;
          
          console.log('Session updated with:', updates);
        }
        
        // Update with destination image if not present
        if (!currentSession.destinationImage) {
          const destinationImage = await fetchDestinationImage(currentSession.destination);
          if (destinationImage) {
            await updateSession(currentSession.id, { destinationImage });
            console.log('Updated session with destination image');
          }
        }
      }
    }

    if (shouldDiscoverPlaces) {
      console.log('=== BACKEND: Will discover places ===');
      console.log('Primary region:', tripInfo!.destination);
      console.log('Interests:', tripInfo!.interests);

      const excludePlaceIds = [
        ...(currentSession!.approvedPlaces || []), // Exclude approved places
        ...(currentSession!.rejectedPlaces || [])  // Exclude rejected places
      ];
      console.log('Excluded place IDs (approved + rejected):', excludePlaceIds);

      console.log('=== BACKEND: Calling discoverPlaces ===');
      
      try {
        console.log('Priority place types (will boost relevance):', tripInfo?.priorityPlaceTypes);
        
        if (tripInfo?.priorityPlaceTypes && tripInfo.priorityPlaceTypes.length > 0) {
          console.log('⚡ CONTEXT-AWARE MODE: User wants', tripInfo.priorityPlaceTypes.join(', '), 'in latest message');
        }
        
        // Single location search
        discoveredPlaces = await discoverPlaces({
          region: tripInfo?.destination || '',
          interests: tripInfo?.interests || [],
          userId,
          limit: 30,
          excludePlaceIds,
          priorityPlaceTypes: tripInfo?.priorityPlaceTypes || []
        });
      } catch (discoveryError) {
        console.error('=== BACKEND: Discovery failed ===', discoveryError);
        // Continue without places - AI can still respond
        discoveredPlaces = [];
      }

      console.log('=== BACKEND: Discovery complete ===');
      console.log('Discovered places count:', discoveredPlaces?.length || 0);
      if (discoveredPlaces && discoveredPlaces.length > 0) {
        console.log('First place:', discoveredPlaces[0]);
        await saveDiscoveredPlaces(currentSession!.id, discoveredPlaces);
        console.log('Places saved to database');
      } else {
        console.log('WARNING: No places discovered!');
      }
    } else {
      console.log('=== BACKEND: No trip info extracted, skipping discovery ===');
    }

    // Generate AI response AFTER place discovery so AI knows which places were found
    let aiSystemPrompt = SYSTEM_PROMPT;
    
    // If we discovered places, add them to the prompt so AI only mentions places that exist
    if (discoveredPlaces && discoveredPlaces.length > 0) {
      const placesList = discoveredPlaces.slice(0, 7).map((p, i) => 
        `${i + 1}. ${p.placeName} (${p.placeType}${p.source === 'instagram' ? ' - from user saves' : ''})`
      ).join('\n');
      
      aiSystemPrompt += `\n\nIMPORTANT: The following places were just discovered and WILL BE SHOWN to the user as cards ABOVE your message. ONLY mention places from this list. Do NOT mention places that aren't in this list:\n\n${placesList}\n\nDescribe these specific places in your response. Tell the user to check the cards above. Prioritize mentioning places marked "from user saves" first.`;
    } else {
      // No places being shown - inform the AI
      aiSystemPrompt += `\n\nIMPORTANT: NO place cards are being shown for this message. Do NOT mention "places above" or "cards above". Respond naturally to the user's message without referring to place cards.`;
    }

    const response = await generateText({
      model: openrouter('anthropic/claude-3.5-sonnet'),
      messages: [
        { role: 'system', content: aiSystemPrompt },
        ...messages.map((m: any) => ({
          role: m.role,
          content: m.content
        }))
      ],
      temperature: 0.7
    });

    console.log('=== BACKEND: AI response generated ===');

    const responseData: any = {
      message: response.text,
      sessionId: currentSession?.id
    };

    // We'll add places to conversation history after we fetch them
    let placesData = null;

    // Check if user wants to finalize (using the shouldFinalize variable defined earlier)
    if (shouldFinalize && currentSession && currentSession.approvedPlaces && currentSession.approvedPlaces.length > 0) {
      console.log('=== BACKEND: Finalizing itinerary ===');
      await finalizeSession(currentSession.id);
      
      responseData.finalized = true;
      responseData.approvedPlacesCount = currentSession.approvedPlaces.length;
    }

    // Auto-generate session title ONLY when actively planning (places discovered)
    if (currentSession && tripInfo && discoveredPlaces && discoveredPlaces.length > 0 && currentSession.approvedPlaces && currentSession.approvedPlaces.length >= 2) {
      try {
        console.log('=== BACKEND: Generating session title ===');
        
        const titlePrompt = `Generate a short, catchy trip title (max 40 characters) based on:
Destination: ${tripInfo.destination}
Interests: ${tripInfo.interests.join(', ')}
Number of places: ${currentSession.approvedPlaces.length}

Examples: "Jama Masjid Food Tour", "Old Delhi Heritage Walk", "Delhi Street Food Adventure"

Return ONLY the title, nothing else.`;

        const titleResponse = await generateText({
          model: openrouter('anthropic/claude-3.5-sonnet'),
          messages: [{ role: 'user', content: titlePrompt }],
          temperature: 0.7
        });

        const newTitle = titleResponse.text.trim().replace(/['"]/g, '');
        if (newTitle && newTitle.length <= 50) {
          await updateSession(currentSession.id, { title: newTitle });
          responseData.sessionTitle = newTitle;
          console.log('Session title updated:', newTitle);
        }
      } catch (error) {
        console.error('Failed to generate title:', error);
      }
    }

    if (discoveredPlaces && discoveredPlaces.length > 0) {
      // Fetch photo URLs and ratings for ALL places (not just 7)
      const placesWithPhotos = await Promise.all(
        discoveredPlaces.map(async (p) => {
          let photoUrl = null;
          let rating = p.rating || 0;
          
          try {
            const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
            
            // If we have photoReference and rating, use them directly
            if (p.photoReference && p.rating > 0) {
              const requestUrl = `https://places.googleapis.com/v1/${p.photoReference}/media?maxHeightPx=400&maxWidthPx=400&key=${apiKey}`;
              const res = await fetch(requestUrl);
              photoUrl = res.url;
            } else {
              // For user places without photoReference or rating, fetch place details
              console.log(`Fetching details for user place: ${p.placeName} (${p.placeId})`);
              
              const [placeDetails] = await client.getPlace({
                name: `places/${p.placeId}`
              }, {
                otherArgs: {
                  headers: {
                    'X-Goog-FieldMask': 'photos,rating'
                  }
                }
              });
              
              // Get photo
              if (placeDetails?.photos?.[0]?.name) {
                const photoName = placeDetails.photos[0].name;
                const requestUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&maxWidthPx=400&key=${apiKey}`;
                const res = await fetch(requestUrl);
                photoUrl = res.url;
                console.log(`Photo fetched for ${p.placeName}`);
              }
              
              // Get rating
              if (placeDetails?.rating) {
                rating = placeDetails.rating;
                console.log(`Rating fetched for ${p.placeName}: ${rating}`);
              }
            }
          } catch (error) {
            console.error(`Failed to fetch details for ${p.placeName}:`, error);
          }
          
          // Check if this place is already approved
          const isApproved = currentSession?.approvedPlaces?.includes(p.placeId) || false;
          
          return {
            placeId: p.placeId,
            name: p.placeName,
            type: p.placeType,
            rating: rating,
            address: p.formattedAddress,
            source: p.source,
            relevanceScore: p.relevanceScore,
            photoUrl,
            isApproved
          };
        })
      );
      
      responseData.places = placesWithPhotos;
      placesData = placesWithPhotos;
      console.log('=== BACKEND: Returning places ===');
      console.log('Places count:', responseData.places.length);
      console.log('Places with photos:', placesWithPhotos.filter(p => p.photoUrl).length);
      console.log('Places with ratings:', placesWithPhotos.filter(p => p.rating > 0).length);
      console.log('Already approved:', placesWithPhotos.filter(p => p.isApproved).length);
    } else {
      console.log('=== BACKEND: No places to return ===');
    }

    // Save conversation history to session (including places if available)
    if (currentSession) {
      const assistantMessage: any = { 
        role: 'assistant', 
        content: response.text, 
        timestamp: new Date() 
      };
      
      if (placesData) {
        assistantMessage.places = placesData;
      }
      
      const updatedHistory = [...messages, assistantMessage];
      await updateSession(currentSession.id, {
        conversationHistory: updatedHistory
      } as any);
      console.log('=== BACKEND: Conversation history saved with places ===');
    }

    console.log('=== BACKEND: Sending response ===');
    return NextResponse.json(responseData);

  } catch (error) {
    console.error('=== BACKEND: ERROR ===', error);
    return NextResponse.json(
      { error: 'Failed to process message', details: String(error) },
      { status: 500 }
    );
  }
}
