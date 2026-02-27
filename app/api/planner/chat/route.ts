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

const SYSTEM_PROMPT = `You are an expert AI trip planner. Your role is to help users plan perfect multi-day trips.

IMPORTANT: When suggesting places, ALWAYS prioritize places the user has saved from Instagram. These are marked with source: "instagram" and should be mentioned first as "places you've saved" or "from your Instagram saves".

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

function extractTripInfo(messages: any[], currentSession: any) {
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMessage) return null;

  const content = lastUserMessage.content.toLowerCase();
  
  console.log('=== Extracting from message ===');
  console.log('Content:', content);
  console.log('Current session destination:', currentSession?.destination);
  
  // Extract multiple locations from the message
  const locations: string[] = [];
  let destination = null;
  let specificPlace = null;
  
  // Common stop words to exclude
  const stopWords = ['the', 'for', 'and', 'with', 'from', 'april', 'weekend', 'first', 'day', 'rest', 'most', 'best', 'all', 'well', 'just', 'but', 'want', 'taste', 'visit'];
  
  // Pattern 1: "in [CITY]" - captures city names (word boundary before next preposition/punctuation)
  const inPattern = content.match(/\bin\s+([a-z]+(?:\s+[a-z]+)?)\s+(?:from|on|over|for|,|!|\.|$)/gi);
  if (inPattern) {
    inPattern.forEach((match: string) => {
      const place = match.replace(/\bin\s+/i, '').replace(/\s+(?:from|on|over|for|,|!|\.|$).*$/i, '').trim();
      if (place && place.length > 2 && !stopWords.includes(place.toLowerCase())) {
        locations.push(place);
        console.log('Pattern "in X" matched:', place);
      }
    });
  }
  
  // Pattern 2: "visit/go to X" - captures specific places (only proper nouns, not verbs)
  // BUT exclude if it's just a place type (temple, ghat, etc.) without a city context
  const visitPattern = content.match(/(?:visit|visiting)\s+(?:the\s+)?([a-z]+(?:\s+[a-z]+){0,3}?)(?:\s+(?:temple|ghat|masjid|palace|fort|museum|market|bazaar|chowk))?(?:\s+(?:but|and|as|,|!|\.))/gi);
  if (visitPattern) {
    visitPattern.forEach((match: string) => {
      const place = match.replace(/(?:visit|visiting)\s+(?:the\s+)?/i, '').replace(/\s+(?:but|and|as|,|!|\.).*$/i, '').trim();
      
      // Skip if it's a generic place type without city context (e.g., "nearest temple", "the ghats")
      const isGenericPlace = /^(nearest|the|a|an)\s+/i.test(place) || 
                            /\b(temple|ghat|masjid|palace|fort|museum|market|bazaar|chowk)s?$/i.test(place);
      
      if (place && place.length > 2 && !stopWords.includes(place.toLowerCase()) && !locations.includes(place) && !isGenericPlace) {
        locations.push(place);
        console.log('Pattern "visit X" matched:', place);
      } else if (isGenericPlace) {
        console.log('Skipping generic place reference:', place);
      }
    });
  }
  
  // Pattern 3: "at [PLACE]" or "near [PLACE]" - captures locations
  const atPattern = content.match(/\b(?:at|near)\s+([a-z]+(?:\s+[a-z]+)?)\s+(?:temple|ghat|masjid|palace|fort|but|and|,|!|\.)/gi);
  if (atPattern) {
    atPattern.forEach((match: string) => {
      const place = match.replace(/\b(?:at|near)\s+/i, '').replace(/\s+(?:temple|ghat|masjid|palace|fort|but|and|,|!|\.).*$/i, '').trim();
      if (place && place.length > 2 && !stopWords.includes(place.toLowerCase()) && !locations.includes(place)) {
        locations.push(place);
        console.log('Pattern "at/near X" matched:', place);
      }
    });
  }
  
  // Use extracted location or fall back to session destination
  destination = locations[0] || currentSession?.destination || null;
  specificPlace = locations[0] || null;
  
  // If session destination is still "New Trip", ignore it and require explicit location
  if (destination === 'New Trip') {
    destination = locations[0] || null;
  }
  
  // If user is refining (mentions specific places/preferences but no new city), use session destination
  // BUT only if session has a real destination (not "New Trip")
  const isRefining = !locations.length && 
                     currentSession?.destination && 
                     currentSession.destination !== 'New Trip' &&
                     (
                       content.includes('stay') || 
                       content.includes('near') || 
                       content.includes('want') ||
                       content.includes('looking for') ||
                       content.includes('prefer') ||
                       content.includes('authentic') ||
                       content.includes('good place') ||
                       content.includes('also') ||
                       content.includes('as well') ||
                       content.includes('too')
                     );
  
  if (isRefining) {
    destination = currentSession.destination;
    console.log('User is refining, using session destination:', destination);
  }
  
  const daysMatch = content.match(/(\d+)\s*days?/i);
  const days = daysMatch ? parseInt(daysMatch[1]) : undefined;
  
  // Extract dates - look for patterns like "16 april to 19 april" or "april 16-19"
  let startDate: Date | undefined = undefined;
  let endDate: Date | undefined = undefined;
  let calculatedDays: number | undefined = undefined;
  
  // Pattern: "16 april to 19 april" or "april 16 to april 19"
  const dateRangePattern = /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(?:to|until|-)\s+(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i;
  const dateRangeMatch = content.match(dateRangePattern);
  
  if (dateRangeMatch) {
    const [, startDay, startMonth, endDay, endMonth] = dateRangeMatch;
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    
    // Parse months
    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
    };
    
    const startMonthNum = months[startMonth.toLowerCase()];
    const endMonthNum = months[endMonth.toLowerCase()];
    
    // Determine year (if month has passed this year, use next year)
    const now = new Date();
    const startYear = startMonthNum < now.getMonth() ? nextYear : currentYear;
    const endYear = endMonthNum < now.getMonth() ? nextYear : currentYear;
    
    startDate = new Date(startYear, startMonthNum, parseInt(startDay));
    endDate = new Date(endYear, endMonthNum, parseInt(endDay));
    
    // Calculate days if not explicitly mentioned
    if (startDate && endDate) {
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      calculatedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end day
      console.log('Calculated days from dates:', calculatedDays);
    }
    
    console.log('Extracted dates:', { startDate, endDate, calculatedDays });
  }
  
  const interests: string[] = [];
  
  // Food & Dining
  if (content.includes('food') || content.includes('cuisine') || content.includes('restaurant') || 
      content.includes('eat') || content.includes('thali') || content.includes('daal') || 
      content.includes('churma') || content.includes('dining')) {
    interests.push('food', 'restaurant');
  }
  
  // Culture & Heritage
  if (content.includes('culture') || content.includes('heritage') || content.includes('history') || 
      content.includes('authentic')) {
    interests.push('culture', 'museum');
  }
  
  // Nature & Parks
  if (content.includes('nature') || content.includes('park') || content.includes('wildlife')) {
    interests.push('nature', 'park');
  }
  
  // Adventure
  if (content.includes('adventure') || content.includes('trek') || content.includes('hiking')) {
    interests.push('adventure', 'tourist_attraction');
  }
  
  // Religious Places
  if (content.includes('temple') || content.includes('church') || content.includes('mosque') || 
      content.includes('masjid') || content.includes('religious') || content.includes('mandir')) {
    interests.push('place_of_worship');
  }
  
  // Shopping
  if (content.includes('shopping') || content.includes('market') || content.includes('bazaar') || 
      content.includes('chowk')) {
    interests.push('shopping_mall', 'store');
  }
  
  // Historical Sites
  if (content.includes('palace') || content.includes('fort') || content.includes('monument')) {
    interests.push('tourist_attraction', 'museum');
  }
  
  // Water Bodies
  if (content.includes('lake') || content.includes('river') || content.includes('water')) {
    interests.push('tourist_attraction', 'park');
  }
  
  // Ghats (specific to Indian cities)
  if (content.includes('ghat') || content.includes('ghats')) {
    interests.push('tourist_attraction', 'ghat');
  }
  
  // Catch-all
  if (content.includes('everything') || content.includes('all') || content.includes('anything')) {
    interests.push('tourist_attraction', 'restaurant', 'museum');
  }
  
  // Detect explicit place type mentions for PRIORITY BOOSTING
  // These are what the user wants RIGHT NOW in this message
  const priorityPlaceTypes: string[] = [];
  
  // Ghats - highest priority for spiritual/cultural cities
  if (content.includes('ghat') || content.includes('ghats')) {
    priorityPlaceTypes.push('ghat');
    console.log('🎯 User explicitly wants: GHATS');
  }
  
  // Temples
  if (content.includes('temple') || content.includes('mandir')) {
    priorityPlaceTypes.push('temple', 'place_of_worship');
    console.log('🎯 User explicitly wants: TEMPLES');
  }
  
  // Food places - check for strong food indicators
  if (content.includes('street food') || content.includes('famous food') || 
      content.includes('best food') || content.includes('food places') ||
      content.includes('restaurants') || content.includes('where to eat')) {
    priorityPlaceTypes.push('restaurant', 'food');
    console.log('🎯 User explicitly wants: FOOD/RESTAURANTS');
  }
  
  // Forts & Palaces
  if (content.includes('fort') || content.includes('palace')) {
    priorityPlaceTypes.push('fort', 'palace');
    console.log('🎯 User explicitly wants: FORTS/PALACES');
  }
  
  // Museums
  if (content.includes('museum')) {
    priorityPlaceTypes.push('museum');
    console.log('🎯 User explicitly wants: MUSEUMS');
  }
  
  // Markets
  if (content.includes('market') || content.includes('bazaar') || content.includes('shopping')) {
    priorityPlaceTypes.push('market', 'shopping');
    console.log('🎯 User explicitly wants: MARKETS/SHOPPING');
  }
  
  // Default interests if nothing specific mentioned
  if (interests.length === 0) {
    interests.push('tourist_attraction', 'restaurant');
  }
  
  console.log('Extracted interests:', interests);
  console.log('Priority place types:', priorityPlaceTypes);

  console.log('=== Extraction result ===');
  console.log('All locations:', locations);
  console.log('Primary destination:', destination);
  console.log('Specific place:', specificPlace);
  console.log('Is refining?:', isRefining);
  console.log('Days:', days);
  console.log('Start date:', startDate);
  console.log('End date:', endDate);
  console.log('Interests:', interests);
  console.log('Priority place types:', priorityPlaceTypes);

  return { 
    destination, 
    specificPlace,
    allLocations: locations.length > 0 ? locations : (destination ? [destination] : []),
    city: destination,
    days: days || calculatedDays, 
    startDate,
    endDate,
    interests,
    priorityPlaceTypes
  };
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

    console.log('Messages count:', messages.length);
    console.log('Last message:', messages[messages.length - 1]);

    let currentSession = sessionId ? await getSession(sessionId) : await getUserActiveSession(userId);
    console.log('Current session:', currentSession?.id);

    const tripInfo = extractTripInfo(messages, currentSession);
    console.log('=== BACKEND: Extracted trip info ===');
    if (tripInfo) {
      console.log('Destination:', tripInfo.destination);
      console.log('Interests:', tripInfo.interests);
      console.log('Priority types:', tripInfo.priorityPlaceTypes);
      console.log('Days:', tripInfo.days);
    } else {
      console.log('No trip info extracted');
    }

    let discoveredPlaces = null;

    // Check if user wants to finalize - if so, skip place discovery
    const userMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const shouldFinalize = userMessage.includes('finalize') || 
                          userMessage.includes('done') || 
                          userMessage.includes('that\'s all') ||
                          userMessage.includes('create itinerary') ||
                          userMessage.includes('finish planning');
    
    // Intelligent decision: Should we discover places for this message?
    const shouldDiscoverPlaces = tripInfo && 
                                 tripInfo.destination && 
                                 !shouldFinalize && // Don't discover when finalizing
                                 !userMessage.includes('looks amazing') && // Don't discover for approval messages
                                 !userMessage.includes('looks good') &&
                                 !userMessage.includes('perfect') &&
                                 !userMessage.includes('great selection');
    
    console.log('=== BACKEND: Place Discovery Decision ===');
    console.log('Should finalize?', shouldFinalize);
    console.log('Should discover places?', shouldDiscoverPlaces);
    console.log('User message:', userMessage);

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
        const shouldUpdate = 
          (currentSession.destination === 'New Trip' && tripInfo.destination !== 'New Trip') ||
          (tripInfo.days && tripInfo.days !== currentSession.days) ||
          (tripInfo.startDate && !currentSession.startDate) ||
          (tripInfo.endDate && !currentSession.endDate);
        
        if (shouldUpdate) {
          console.log('Updating session with new trip info');
          console.log('Current session:', { 
            destination: currentSession.destination, 
            days: currentSession.days,
            startDate: currentSession.startDate,
            endDate: currentSession.endDate
          });
          console.log('New trip info:', { 
            destination: tripInfo.destination, 
            days: tripInfo.days,
            startDate: tripInfo.startDate,
            endDate: tripInfo.endDate
          });
          
          const updates: any = {};
          if (currentSession.destination === 'New Trip' && tripInfo.destination !== 'New Trip') {
            updates.destination = tripInfo.destination;
          }
          if (tripInfo.days) {
            updates.days = tripInfo.days;
          }
          if (tripInfo.startDate) {
            updates.startDate = tripInfo.startDate;
          }
          if (tripInfo.endDate) {
            updates.endDate = tripInfo.endDate;
          }
          
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
      console.log('All locations:', tripInfo!.allLocations);
      console.log('Interests:', tripInfo!.interests);

      const excludePlaceIds = [
        ...(currentSession!.rejectedPlaces || []) // Only exclude rejected places, not approved ones
      ];
      console.log('Excluded place IDs (rejected only):', excludePlaceIds);

      console.log('=== BACKEND: Calling discoverPlaces ===');
      
      try {
        // Filter out locations that are just place names within the main destination
        // Only do multi-location search if we have multiple distinct cities/regions
        const validLocations = tripInfo.allLocations.filter((loc: string) => {
          // Keep the primary destination
          if (loc === tripInfo.destination) return true;
          
          // Skip if it contains generic place type words (temple, ghat, etc.)
          const hasPlaceType = /\b(temple|ghat|masjid|palace|fort|museum|market|bazaar|chowk|mandir)\b/i.test(loc);
          if (hasPlaceType) {
            console.log(`Skipping "${loc}" - appears to be a place name, not a city`);
            return false;
          }
          
          return true;
        });
        
        console.log('Valid locations for search:', validLocations);
        console.log('Priority place types (will boost relevance):', tripInfo.priorityPlaceTypes);
        
        if (tripInfo.priorityPlaceTypes && tripInfo.priorityPlaceTypes.length > 0) {
          console.log('⚡ CONTEXT-AWARE MODE: User wants', tripInfo.priorityPlaceTypes.join(', '), 'in latest message');
        }
        
        // If multiple valid locations mentioned, search near all of them
        if (validLocations.length > 1) {
          console.log('Multiple locations detected, searching near all:', validLocations);
          
          // Search near each location and combine results
          const allDiscoveredPlaces = [];
          for (const location of validLocations.slice(0, 3)) { // Limit to 3 locations
            console.log(`Searching near: ${location}`);
            try {
              const placesNearLocation = await discoverPlaces({
                region: location,
                interests: tripInfo.interests,
                userId,
                limit: 15,
                excludePlaceIds,
                priorityPlaceTypes: tripInfo.priorityPlaceTypes
              });
              allDiscoveredPlaces.push(...placesNearLocation);
            } catch (locationError) {
              console.error(`Failed to discover places near ${location}:`, locationError);
              // Continue with other locations
            }
          }
          
          // Deduplicate and sort by relevance
          const uniquePlaces = new Map();
          allDiscoveredPlaces.forEach(place => {
            if (!uniquePlaces.has(place.placeId) || place.relevanceScore > uniquePlaces.get(place.placeId).relevanceScore) {
              uniquePlaces.set(place.placeId, place);
            }
          });
          
          discoveredPlaces = Array.from(uniquePlaces.values())
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 30);
          
          console.log('Combined results from multiple locations:', discoveredPlaces.length);
        } else {
          // Single location search
          discoveredPlaces = await discoverPlaces({
            region: tripInfo.destination,
            interests: tripInfo.interests,
            userId,
            limit: 30,
            excludePlaceIds,
            priorityPlaceTypes: tripInfo.priorityPlaceTypes
          });
        }
      } catch (discoveryError) {
        console.error('=== BACKEND: Discovery failed ===', discoveryError);
        // Continue without places - AI can still respond
        discoveredPlaces = [];
      }

      console.log('=== BACKEND: Discovery complete ===');
      console.log('Discovered places count:', discoveredPlaces?.length || 0);
      if (discoveredPlaces && discoveredPlaces.length > 0) {
        console.log('First place:', discoveredPlaces[0]);
        await saveDiscoveredPlaces(currentSession.id, discoveredPlaces);
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
Locations: ${tripInfo.allLocations?.join(', ') || tripInfo.destination}
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
      // Fetch photo URLs and ratings for ALL places using their placeId
      const placesWithPhotos = await Promise.all(
        discoveredPlaces.slice(0, 7).map(async (p) => {
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
