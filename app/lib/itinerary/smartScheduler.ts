/**
 * Smart Itinerary Scheduler
 * 
 * Intelligently schedules places across multiple days based on:
 * - Time of day preferences (ghats in morning/evening, restaurants at meal times)
 * - Geographic proximity (group nearby places)
 * - Trip duration (split across days)
 * - Place type and optimal visiting times
 */

interface Place {
  placeId: string;
  displayName: string;
  type: string;
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface TimeSlot {
  start: number; // minutes from midnight
  end: number;
  label: string;
  suitableFor: string[];
}

interface ScheduledPlace {
  place: Place;
  day: number;
  timeSlot: string;
  arrivalTime: string;
  departureTime: string;
  duration: number;
  travelTime: number;
  distanceFromPrevious: number;
  suggestion: string;
  alternatives?: Place[]; // If too many places, suggest alternatives
}

interface DaySchedule {
  day: number;
  date?: string;
  places: ScheduledPlace[];
  totalDuration: number;
  totalDistance: number;
  mealTimes: {
    breakfast?: ScheduledPlace;
    lunch?: ScheduledPlace;
    dinner?: ScheduledPlace;
  };
}

// Time slots with preferences
const TIME_SLOTS: TimeSlot[] = [
  {
    start: 5 * 60, // 5:00 AM
    end: 8 * 60, // 8:00 AM
    label: 'Early Morning',
    suitableFor: ['ghat', 'place_of_worship', 'tourist_attraction', 'park']
  },
  {
    start: 8 * 60, // 8:00 AM
    end: 10 * 60, // 10:00 AM
    label: 'Morning',
    suitableFor: ['restaurant', 'cafe', 'tourist_attraction', 'museum']
  },
  {
    start: 10 * 60, // 10:00 AM
    end: 13 * 60, // 1:00 PM
    label: 'Late Morning',
    suitableFor: ['tourist_attraction', 'museum', 'shopping_mall', 'market']
  },
  {
    start: 13 * 60, // 1:00 PM
    end: 15 * 60, // 3:00 PM
    label: 'Afternoon',
    suitableFor: ['restaurant', 'cafe']
  },
  {
    start: 15 * 60, // 3:00 PM
    end: 17 * 60, // 5:00 PM
    label: 'Late Afternoon',
    suitableFor: ['tourist_attraction', 'shopping_mall', 'market', 'park']
  },
  {
    start: 17 * 60, // 5:00 PM
    end: 19 * 60, // 7:00 PM
    label: 'Evening',
    suitableFor: ['ghat', 'tourist_attraction', 'park']
  },
  {
    start: 19 * 60, // 7:00 PM
    end: 22 * 60, // 10:00 PM
    label: 'Night',
    suitableFor: ['restaurant', 'cafe']
  }
];

/**
 * Get optimal time slot for a place type
 */
function getOptimalTimeSlots(placeType: string): TimeSlot[] {
  return TIME_SLOTS.filter(slot => slot.suitableFor.includes(placeType));
}

/**
 * Get duration for a place based on type
 */
function getPlaceDuration(placeType: string): number {
  const durations: Record<string, number> = {
    'restaurant': 90,
    'cafe': 60,
    'museum': 120,
    'place_of_worship': 45,
    'shopping_mall': 120,
    'market': 90,
    'tourist_attraction': 90,
    'ghat': 60,
    'park': 60,
    'fort': 120,
    'palace': 120
  };
  
  return durations[placeType] || 60;
}

/**
 * Calculate distance between two points
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate travel time between places
 */
function calculateTravelTime(distance: number): number {
  // Assume 3 km/h walking speed in city
  let travelTime = Math.ceil((distance / 3) * 60); // minutes
  if (travelTime < 5) travelTime = 5; // Minimum 5 min
  if (travelTime > 30) travelTime = 30; // Cap at 30 min
  return travelTime;
}

/**
 * Format time from minutes to readable string
 */
function formatTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const min = minutes % 60;
  return `${hour % 12 || 12}:${min.toString().padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/**
 * Get suggestion based on place type and time
 */
function getSuggestion(placeType: string, hour: number): string {
  if (placeType === 'ghat') {
    if (hour >= 5 && hour < 8) return 'Perfect time for sunrise boat ride and morning rituals';
    if (hour >= 17 && hour < 20) return 'Witness the spectacular evening Ganga Aarti ceremony';
    return 'Experience the spiritual atmosphere';
  }
  
  if (placeType === 'restaurant' || placeType === 'cafe') {
    if (hour >= 7 && hour < 10) return 'Great spot for breakfast';
    if (hour >= 12 && hour < 15) return 'Perfect time for lunch';
    if (hour >= 18 && hour < 22) return 'Ideal for dinner';
    return 'Enjoy some food and drinks';
  }
  
  if (placeType === 'place_of_worship') {
    if (hour >= 5 && hour < 9) return 'Morning prayers and peaceful atmosphere';
    if (hour >= 17 && hour < 20) return 'Evening aarti and ceremonies';
    return 'Take time to explore and reflect';
  }
  
  if (placeType === 'museum' || placeType === 'fort' || placeType === 'palace') {
    return 'Explore the history and architecture';
  }
  
  if (placeType === 'market' || placeType === 'shopping_mall') {
    if (hour >= 16) return 'Evening shopping and local crafts';
    return 'Browse local shops and souvenirs';
  }
  
  if (placeType === 'park') {
    if (hour < 10) return 'Morning walk in fresh air';
    if (hour >= 16) return 'Evening stroll and relaxation';
    return 'Relax and enjoy nature';
  }
  
  return 'Enjoy your visit';
}

/**
 * Group nearby places (within 2km)
 */
function groupNearbyPlaces(places: Place[]): Place[][] {
  const groups: Place[][] = [];
  const visited = new Set<string>();
  
  for (const place of places) {
    if (visited.has(place.placeId)) continue;
    
    const group: Place[] = [place];
    visited.add(place.placeId);
    
    // Find nearby places
    for (const other of places) {
      if (visited.has(other.placeId)) continue;
      
      const distance = calculateDistance(place.lat, place.lng, other.lat, other.lng);
      if (distance <= 2) { // Within 2km
        group.push(other);
        visited.add(other.placeId);
      }
    }
    
    groups.push(group);
  }
  
  return groups;
}

/**
 * Smart schedule generation
 */
export function generateSmartSchedule(
  places: Place[],
  days: number,
  startDate?: Date
): DaySchedule[] {
  console.log('=== SMART SCHEDULER: Starting ===');
  console.log('Places to schedule:', places.length);
  console.log('Days available:', days);
  
  // Categorize places by type
  const ghats = places.filter(p => p.type === 'ghat' || p.displayName.toLowerCase().includes('ghat'));
  const restaurants = places.filter(p => p.type === 'restaurant' || p.type === 'cafe');
  const temples = places.filter(p => p.type === 'place_of_worship');
  const attractions = places.filter(p => 
    !ghats.includes(p) && !restaurants.includes(p) && !temples.includes(p)
  );
  
  console.log('Categorized:', {
    ghats: ghats.length,
    restaurants: restaurants.length,
    temples: temples.length,
    attractions: attractions.length
  });
  
  const daySchedules: DaySchedule[] = [];
  
  // Calculate places per day
  const placesPerDay = Math.ceil(places.length / days);
  const maxPlacesPerDay = 6; // Maximum 6 places per day for comfortable pace
  
  console.log('Places per day:', placesPerDay);
  console.log('Max places per day:', maxPlacesPerDay);
  
  if (placesPerDay > maxPlacesPerDay) {
    console.log('⚠️ Too many places selected! Will suggest alternatives.');
  }
  
  // Generate schedule for each day
  for (let day = 1; day <= days; day++) {
    console.log(`\n=== Scheduling Day ${day} ===`);
    
    const daySchedule: DaySchedule = {
      day,
      date: startDate ? new Date(startDate.getTime() + (day - 1) * 24 * 60 * 60 * 1000).toDateString() : undefined,
      places: [],
      totalDuration: 0,
      totalDistance: 0,
      mealTimes: {}
    };
    
    let currentTime = 6 * 60; // Start at 6:00 AM
    const dayEndTime = 22 * 60; // End at 10:00 PM
    
    // Morning ghat visit (if available)
    if (ghats.length > 0 && day <= ghats.length) {
      const ghat = ghats[day - 1];
      const duration = getPlaceDuration('ghat');
      
      daySchedule.places.push({
        place: ghat,
        day,
        timeSlot: 'Early Morning',
        arrivalTime: formatTime(currentTime),
        departureTime: formatTime(currentTime + duration),
        duration,
        travelTime: 0,
        distanceFromPrevious: 0,
        suggestion: getSuggestion('ghat', Math.floor(currentTime / 60))
      });
      
      currentTime += duration;
      console.log(`Added morning ghat: ${ghat.displayName} at ${formatTime(currentTime - duration)}`);
    }
    
    // Breakfast (if restaurant available)
    if (restaurants.length > 0) {
      const breakfastTime = 8 * 60; // 8:00 AM
      if (currentTime < breakfastTime) currentTime = breakfastTime;
      
      const restaurant = restaurants[Math.floor((day - 1) * 3 % restaurants.length)];
      const duration = 60; // Breakfast duration
      const distance = daySchedule.places.length > 0 
        ? calculateDistance(
            daySchedule.places[daySchedule.places.length - 1].place.lat,
            daySchedule.places[daySchedule.places.length - 1].place.lng,
            restaurant.lat,
            restaurant.lng
          )
        : 0;
      const travelTime = calculateTravelTime(distance);
      
      currentTime += travelTime;
      
      const breakfastPlace: ScheduledPlace = {
        place: restaurant,
        day,
        timeSlot: 'Morning',
        arrivalTime: formatTime(currentTime),
        departureTime: formatTime(currentTime + duration),
        duration,
        travelTime,
        distanceFromPrevious: distance,
        suggestion: 'Great spot for breakfast'
      };
      
      daySchedule.places.push(breakfastPlace);
      daySchedule.mealTimes.breakfast = breakfastPlace;
      currentTime += duration;
      console.log(`Added breakfast: ${restaurant.displayName} at ${formatTime(currentTime - duration)}`);
    }
    
    // Morning/afternoon attractions
    const morningAttractions = [...temples, ...attractions].slice((day - 1) * 2, day * 2);
    for (const attraction of morningAttractions) {
      if (currentTime >= 13 * 60) break; // Stop before lunch time
      
      const duration = getPlaceDuration(attraction.type);
      const distance = daySchedule.places.length > 0
        ? calculateDistance(
            daySchedule.places[daySchedule.places.length - 1].place.lat,
            daySchedule.places[daySchedule.places.length - 1].place.lng,
            attraction.lat,
            attraction.lng
          )
        : 0;
      const travelTime = calculateTravelTime(distance);
      
      currentTime += travelTime;
      
      if (currentTime + duration > 13 * 60) break; // Would go past lunch
      
      daySchedule.places.push({
        place: attraction,
        day,
        timeSlot: 'Late Morning',
        arrivalTime: formatTime(currentTime),
        departureTime: formatTime(currentTime + duration),
        duration,
        travelTime,
        distanceFromPrevious: distance,
        suggestion: getSuggestion(attraction.type, Math.floor(currentTime / 60))
      });
      
      currentTime += duration;
      console.log(`Added attraction: ${attraction.displayName} at ${formatTime(currentTime - duration)}`);
    }
    
    // Lunch
    if (restaurants.length > 1) {
      const lunchTime = 13 * 60; // 1:00 PM
      if (currentTime < lunchTime) currentTime = lunchTime;
      
      const restaurant = restaurants[Math.floor((day - 1) * 3 + 1) % restaurants.length];
      const duration = 90; // Lunch duration
      const distance = daySchedule.places.length > 0
        ? calculateDistance(
            daySchedule.places[daySchedule.places.length - 1].place.lat,
            daySchedule.places[daySchedule.places.length - 1].place.lng,
            restaurant.lat,
            restaurant.lng
          )
        : 0;
      const travelTime = calculateTravelTime(distance);
      
      currentTime += travelTime;
      
      const lunchPlace: ScheduledPlace = {
        place: restaurant,
        day,
        timeSlot: 'Afternoon',
        arrivalTime: formatTime(currentTime),
        departureTime: formatTime(currentTime + duration),
        duration,
        travelTime,
        distanceFromPrevious: distance,
        suggestion: 'Perfect time for lunch'
      };
      
      daySchedule.places.push(lunchPlace);
      daySchedule.mealTimes.lunch = lunchPlace;
      currentTime += duration;
      console.log(`Added lunch: ${restaurant.displayName} at ${formatTime(currentTime - duration)}`);
    }
    
    // Evening ghat visit (if different from morning)
    if (ghats.length > day) {
      const eveningTime = 17 * 60; // 5:00 PM
      if (currentTime < eveningTime) currentTime = eveningTime;
      
      const ghat = ghats[day]; // Different ghat from morning
      const duration = getPlaceDuration('ghat');
      const distance = daySchedule.places.length > 0
        ? calculateDistance(
            daySchedule.places[daySchedule.places.length - 1].place.lat,
            daySchedule.places[daySchedule.places.length - 1].place.lng,
            ghat.lat,
            ghat.lng
          )
        : 0;
      const travelTime = calculateTravelTime(distance);
      
      currentTime += travelTime;
      
      daySchedule.places.push({
        place: ghat,
        day,
        timeSlot: 'Evening',
        arrivalTime: formatTime(currentTime),
        departureTime: formatTime(currentTime + duration),
        duration,
        travelTime,
        distanceFromPrevious: distance,
        suggestion: getSuggestion('ghat', Math.floor(currentTime / 60))
      });
      
      currentTime += duration;
      console.log(`Added evening ghat: ${ghat.displayName} at ${formatTime(currentTime - duration)}`);
    }
    
    // Dinner
    if (restaurants.length > 2) {
      const dinnerTime = 19 * 60; // 7:00 PM
      if (currentTime < dinnerTime) currentTime = dinnerTime;
      
      const restaurant = restaurants[Math.floor((day - 1) * 3 + 2) % restaurants.length];
      const duration = 90; // Dinner duration
      const distance = daySchedule.places.length > 0
        ? calculateDistance(
            daySchedule.places[daySchedule.places.length - 1].place.lat,
            daySchedule.places[daySchedule.places.length - 1].place.lng,
            restaurant.lat,
            restaurant.lng
          )
        : 0;
      const travelTime = calculateTravelTime(distance);
      
      currentTime += travelTime;
      
      const dinnerPlace: ScheduledPlace = {
        place: restaurant,
        day,
        timeSlot: 'Night',
        arrivalTime: formatTime(currentTime),
        departureTime: formatTime(currentTime + duration),
        duration,
        travelTime,
        distanceFromPrevious: distance,
        suggestion: 'Ideal for dinner'
      };
      
      daySchedule.places.push(dinnerPlace);
      daySchedule.mealTimes.dinner = dinnerPlace;
      currentTime += duration;
      console.log(`Added dinner: ${restaurant.displayName} at ${formatTime(currentTime - duration)}`);
    }
    
    // Calculate totals
    daySchedule.totalDuration = daySchedule.places.reduce((sum, p) => sum + p.duration, 0);
    daySchedule.totalDistance = daySchedule.places.reduce((sum, p) => sum + p.distanceFromPrevious, 0);
    
    console.log(`Day ${day} complete: ${daySchedule.places.length} places, ${daySchedule.totalDuration} min, ${daySchedule.totalDistance.toFixed(2)} km`);
    
    daySchedules.push(daySchedule);
  }
  
  console.log('=== SMART SCHEDULER: Complete ===');
  return daySchedules;
}
