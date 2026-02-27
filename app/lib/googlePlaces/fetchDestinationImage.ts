import client from './client';

export async function fetchDestinationImage(destination: string): Promise<string | null> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
    
    // Search for the destination
    const response = await fetch(
      `https://places.googleapis.com/v1/places:searchText`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.photos'
        },
        body: JSON.stringify({
          textQuery: destination,
          maxResultCount: 1
        })
      }
    );

    const data = await response.json();
    
    if (data.places && data.places[0]?.photos?.[0]?.name) {
      const photoName = data.places[0].photos[0].name;
      const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&maxWidthPx=1200&key=${apiKey}`;
      
      // Fetch to get the actual URL
      const photoResponse = await fetch(photoUrl);
      return photoResponse.url;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to fetch destination image:', error);
    return null;
  }
}
