'use client';
import axios from 'axios';
import {AdvancedMarker, APIProvider, Map, Marker, Pin} from '@vis.gl/react-google-maps';
import {useState, useEffect, useRef} from 'react';
import {MapPlaceDetails, Places} from "../types";
import { PLACE_TYPE_COLORS} from '../lib/placesTypes';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

export default function MapPage(){
  const { isSignedIn } = useUser();
  const searchParams = useSearchParams();
  const placeIdFromUrl = searchParams.get('place');
  const mapRef = useRef<google.maps.Map | null>(null);
  
  const [userLocation, setUserLocation]= useState<{lat: number, lng: number}>({lat: 28.6129, lng:77.2295});
  const [initialCenter, setInitialCenter] = useState<{lat: number, lng: number}>({lat: 28.6129, lng:77.2295});
  const [initialZoom, setInitialZoom] = useState(12);
  const [places, setPlaces]=useState([]);
  const [selectedPlace, setSelectedPlace]= useState<Places | null>(null);
  const [placeDetails, setPlaceDetails] = useState<MapPlaceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [planningMode, setPlanningMode] = useState(false);
  const [selectedPlaces, setSelectedPlaces] = useState<string[]>([]);
  const [itinerary, setItinerary] = useState<any>(null);
  const [generatingRoute, setGeneratingRoute] = useState(false);
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [transportMode, setTransportMode] = useState('driving');
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [sidebarHeight, setSidebarHeight] = useState(70);
  const [isResizing, setIsResizing] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startHeight, setStartHeight] = useState(70);
   
  //this is to get the user's location
  useEffect(()=>{
    navigator.geolocation.getCurrentPosition((position)=>{
      setUserLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
    })
  },[]); //no dependency array so runs only once to get the users location and save them in the state variable

  //this is to get the tagged places
  useEffect(()=>{
    async function getPlaces(){
      const response=await axios.get("api/places");
        setPlaces(response.data);
      
      if (placeIdFromUrl) {
        const place = response.data.find((place: Places) => place.placeId === placeIdFromUrl);
        if (place) {
          setInitialCenter({lat: place.lat, lng: place.lng});
          setInitialZoom(15);
          setSelectedPlace(place);
        }
      }
    };
    getPlaces();
  }, [placeIdFromUrl]);  

  // Fetch place details when a place is selected
  useEffect(()=>{
    if(!selectedPlace) {
      setSidebarOpen(false);
      return;
    }

    const place = selectedPlace;
    setSidebarHeight(70); // Reset to 70% when opening

    async function fetchDetails() {

      console.log(selectedPlace);

      setLoadingDetails(true);
      setSidebarOpen(true);

      try {
        const response = await axios.get(`/api/places/${place.placeId}`);
        setPlaceDetails(response.data);

      } catch (error) {
        
        console.error("Failed to fetch place details:", error);

        setPlaceDetails({
          placeId: place.placeId,
          displayName: place.displayName,
          formattedAddress: place.formattedAddress,
        });
      }
      setLoadingDetails(false);
    }

    fetchDetails();
  },[selectedPlace]);

  const closeSidebar= ()=>{
    setSidebarOpen(false);
    setSidebarHeight(70);
    setTimeout(()=>{
      setSelectedPlace(null);
      setPlaceDetails(null);
    }, 300)
  }

  const togglePlaceSelection = (placeId: string) => {
    setSelectedPlaces(prev => 
      prev.includes(placeId) 
        ? prev.filter(id => id !== placeId)
        : [...prev, placeId]
    );
  };

  const generateRoute = async () => {
    if (selectedPlaces.length < 2) return;
    
    setGeneratingRoute(true);
    setShowTransportModal(false);
    setSidebarHeight(70); // Reset to 70% when showing route
    try {
      const response = await axios.post('/api/itinerary', {
        placeIds: selectedPlaces,
        startTime: '09:00',
        transportMode: transportMode
      });
      setItinerary(response.data);
      setSidebarOpen(true);
    } catch (error) {
      console.error('Failed to generate route:', error);
    }
    setGeneratingRoute(false);
  };

  const exitPlanning = () => {
    setPlanningMode(false);
    setSelectedPlaces([]);
    setItinerary(null);
    setTransportMode('driving');
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsResizing(true);
    setStartY(e.touches[0].clientY);
    setStartHeight(sidebarHeight);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      if (window.innerWidth >= 768) {
        const newWidth = window.innerWidth - e.clientX;
        setSidebarWidth(Math.max(300, Math.min(800, newWidth)));
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isResizing || window.innerWidth >= 768) return;
      
      const touch = e.touches[0];
      const deltaY = startY - touch.clientY;
      const deltaPercent = (deltaY / window.innerHeight) * 100;
      const newHeight = startHeight + deltaPercent;
      
      setSidebarHeight(Math.max(20, Math.min(95, newHeight)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    const handleTouchEnd = () => {
      if (!isResizing) return;
      setIsResizing(false);
      
      // Snap to positions
      if (sidebarHeight < 40) {
        setSidebarOpen(false);
        setSidebarHeight(70);
      } else if (sidebarHeight < 60) {
        setSidebarHeight(70);
      } else if (sidebarHeight > 85) {
        setSidebarHeight(90);
      } else {
        setSidebarHeight(70);
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isResizing, sidebarHeight, startY, startHeight]);

  return(
    <div className='relative w-full h-full overflow-hidden'>
      {planningMode && !itinerary && (
        <div style={{position:'absolute',top:'16px',left:'50%',transform:'translateX(-50%)',zIndex:50,background:'#fff',color:'#000',padding:'12px 24px',borderRadius:'8px',boxShadow:'0 2px 8px rgba(0,0,0,0.15)',display:'flex',gap:'16px',alignItems:'center'}}>
          <span>{selectedPlaces.length} selected</span>
          <button onClick={exitPlanning} style={{padding:'6px 12px',border:'1px solid #ddd',borderRadius:'4px',background:'#fff'}}>Cancel</button>
          <button onClick={() => setShowTransportModal(true)} disabled={selectedPlaces.length < 2} style={{padding:'6px 12px',background:selectedPlaces.length < 2 ? '#ccc' : '#000',color:'#fff',borderRadius:'4px',border:'none',cursor:selectedPlaces.length < 2 ? 'not-allowed' : 'pointer'}}>
            Chart Route
          </button>
        </div>
      )}

      {showTransportModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={() => setShowTransportModal(false)}>
          <div style={{background:'#fff',color:'#000',padding:'24px',borderRadius:'12px',maxWidth:'400px',width:'90%'}} onClick={(e) => e.stopPropagation()}>
            <h3 style={{marginBottom:'16px',fontSize:'18px',fontWeight:'bold'}}>Select Transport Mode</h3>
            
            <div style={{marginBottom:'20px'}}>
              {[
                { value: 'driving', label: 'Driving', icon: '🚗' },
                { value: 'walking', label: 'Walking', icon: '🚶' },
                { value: 'transit', label: 'Transit', icon: '🚌' },
                { value: 'bicycling', label: 'Bicycling', icon: '🚴' }
              ].map(mode => (
                <label key={mode.value} style={{display:'flex',alignItems:'center',padding:'12px',border:'2px solid',borderColor:transportMode === mode.value ? '#000' : '#ddd',borderRadius:'8px',marginBottom:'8px',cursor:'pointer'}}>
                  <input 
                    type="radio" 
                    name="transport" 
                    value={mode.value}
                    checked={transportMode === mode.value}
                    onChange={(e) => setTransportMode(e.target.value)}
                    style={{marginRight:'12px'}}
                  />
                  <span style={{fontSize:'24px',marginRight:'12px'}}>{mode.icon}</span>
                  <span style={{fontWeight:transportMode === mode.value ? 'bold' : 'normal'}}>{mode.label}</span>
                </label>
              ))}
            </div>

            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={() => setShowTransportModal(false)} style={{flex:1,padding:'10px',border:'1px solid #ddd',borderRadius:'8px',background:'#fff'}}>
                Cancel
              </button>
              <button onClick={generateRoute} disabled={generatingRoute} style={{flex:1,padding:'10px',background:'#000',color:'#fff',borderRadius:'8px',border:'none',cursor:generatingRoute ? 'wait' : 'pointer'}}>
                {generatingRoute ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
        <Map
        key={`${initialCenter.lat}-${initialCenter.lng}`}
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID!} 
        defaultCenter={initialCenter}
        defaultZoom={initialZoom}
        style={{width: '100%', height: '100%'}}
        gestureHandling='greedy'
        disableDefaultUI= {false}>
        
        <Marker position={userLocation}/>

        {places.map((place:Places)=> {
          const isSelected = selectedPlaces.includes(place.placeId);
          const routeIndex = itinerary?.route.indexOf(place.placeId);
          
          return(
            <AdvancedMarker 
            key={place.placeId} 
            position={{lat: place.lat, lng: place.lng}} 
            onClick={()=>{
              if (planningMode) {
                togglePlaceSelection(place.placeId);
              } else {
                setSelectedPlace(place);
              }
            }}>
              {planningMode ? (
                <div style={{position:'relative'}}>
                  <Pin
                    background={isSelected ? '#4CAF50' : PLACE_TYPE_COLORS[place.type as keyof (typeof PLACE_TYPE_COLORS)] ?? "#95A5A6"}
                    glyphColor='white'
                    scale={isSelected ? 1.3 : 1}
                  />
                  {isSelected && (
                    <div style={{position:'absolute',top:'-8px',right:'-8px',background:'#fff',borderRadius:'50%',width:'20px',height:'20px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:'bold',border:'2px solid #4CAF50'}}>
                      ✓
                    </div>
                  )}
                  {routeIndex !== -1 && routeIndex !== undefined && (
                    <div style={{position:'absolute',top:'-12px',left:'50%',transform:'translateX(-50%)',background:'#000',color:'#fff',borderRadius:'50%',width:'24px',height:'24px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:'bold'}}>
                      {routeIndex + 1}
                    </div>
                  )}
                </div>
              ) : (
                <Pin
                  background={PLACE_TYPE_COLORS[place.type as keyof (typeof PLACE_TYPE_COLORS)] ?? "#95A5A6"}
                  glyphColor='white'
                  scale= {selectedPlace?.placeId == place.placeId? 1.3 : 1}
                />
              )}
            </AdvancedMarker>
          )
        })};
        </Map>
      </APIProvider>
      
      {/* Overlay backdrop for mobile */}
      {sidebarOpen && (selectedPlace || itinerary) && (
        <div 
          className="absolute inset-0 bg-foreground/20 md:hidden z-10 transition-opacity duration-300"
          onClick={closeSidebar}
        />
      )}
      
      {(selectedPlace || itinerary) && (
      <div 
        className={`
          absolute bg-background shadow-lg z-40 border-l border-border
          
          /* Mobile: bottom sheet */
          inset-x-0 bottom-0 rounded-t-2xl
          ${sidebarOpen ? 'translate-y-0' : ''}
          
          /* Desktop: right sidebar */
          md:inset-y-0 md:right-0 md:left-auto md:bottom-auto
          md:h-full md:rounded-none
          ${sidebarOpen ? 'md:translate-x-0' : 'md:translate-x-full'}
          md:translate-y-0
        `}
        style={{
          height: typeof window !== 'undefined' && window.innerWidth < 768 ? (sidebarOpen ? `${sidebarHeight}vh` : '60px') : '100%',
          width: typeof window !== 'undefined' && window.innerWidth >= 768 ? `${sidebarWidth}px` : '100%',
          transform: typeof window !== 'undefined' && window.innerWidth < 768 && !sidebarOpen ? 'translateY(calc(100% - 60px))' : undefined,
          transition: isResizing ? 'none' : 'transform 0.3s ease-in-out, height 0.3s ease-in-out'
        }}
      >
        {/* Resize handle - Desktop (left edge) */}
        <div 
          className="hidden md:block absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500 transition-colors"
          onMouseDown={handleMouseDown}
          style={{zIndex: 50}}
        />

        {/* Resize handle - Mobile (top edge) */}
        <div 
          className="md:hidden absolute top-0 left-0 right-0 h-10 cursor-ns-resize flex items-center justify-center touch-none bg-background"
          onTouchStart={handleTouchStart}
          onClick={() => {
            if (!sidebarOpen) {
              setSidebarOpen(true);
              setSidebarHeight(70);
            }
          }}
          style={{zIndex: 50}}
        >
          <div className="w-12 h-1.5 bg-gray-400 rounded-full" />
        </div>

          {/* header */}
          <div className='flex item-center justify-between border-b px-5 py-4' style={{marginTop: typeof window !== 'undefined' && window.innerWidth < 768 ? '10px' : '0', display: typeof window !== 'undefined' && window.innerWidth < 768 && !sidebarOpen ? 'none' : 'flex'}}>
            <h1> {loadingDetails ? "loading..." : itinerary ? "Your Route" : placeDetails?.displayName}</h1>
            <button onClick={closeSidebar}>
              <img src="/cross.svg" className='w-5 h-5'></img>
            </button>
          </div>

          {/* content */}
          <div className="overflow-y-auto" style={{
            height: typeof window !== 'undefined' && window.innerWidth < 768 
              ? (sidebarOpen ? `calc(${sidebarHeight}vh - 90px)` : '0px')
              : 'calc(100% - 56px)',
            display: typeof window !== 'undefined' && window.innerWidth < 768 && !sidebarOpen ? 'none' : 'block'
          }}>
            {itinerary ? (
              <div style={{padding:'20px'}}>
                <div style={{marginBottom:'16px',paddingBottom:'16px',borderBottom:'1px solid #333'}}>
                  <div style={{fontSize:'18px',fontWeight:'bold',marginBottom:'8px'}}>Your Route - {itinerary.route.length} places</div>
                  <div style={{fontSize:'14px',color:'#888',marginBottom:'8px'}}>
                    Total: {Math.floor(itinerary.totalTime / 60)}h {itinerary.totalTime % 60}m | {(itinerary.totalDistance / 1000).toFixed(1)} km
                  </div>
                  <div style={{fontSize:'11px',color:'#666'}}>
                    Tap transport options to see alternatives
                  </div>
                </div>
                
                {itinerary.timeline.map((item: any, idx: number) => (
                  <div key={idx} style={{marginBottom:'16px'}}>
                    {item.type === 'visit' ? (
                      <div style={{padding:'12px',background:'#1a1a1a',borderRadius:'8px'}}>
                        <div style={{fontSize:'16px',fontWeight:'bold',marginBottom:'4px'}}>{idx / 2 + 1}. {item.placeName}</div>
                        <div style={{fontSize:'14px',color:'#888',marginBottom:'4px'}}>{item.arrivalTime} - {item.departureTime}</div>
                        <div style={{fontSize:'12px',color:'#666'}}>Visit duration: {item.visitDuration} min</div>
                      </div>
                    ) : (
                      <div style={{padding:'12px',background:'#0a0a0a',borderRadius:'8px',border:'1px solid #222'}}>
                        <div style={{fontSize:'12px',color:'#666',marginBottom:'8px'}}>Travel options:</div>
                        {item.options?.map((opt: any, optIdx: number) => (
                          <div key={optIdx} style={{padding:'8px',marginBottom:'4px',background:opt.mode === item.mode ? '#1a1a1a' : 'transparent',borderRadius:'4px',border:opt.mode === item.mode ? '1px solid #333' : '1px solid transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                              <span style={{fontSize:'18px'}}>
                                {opt.mode === 'driving' && '🚗'}
                                {opt.mode === 'walking' && '🚶'}
                                {opt.mode === 'transit' && '🚌'}
                                {opt.mode === 'bicycling' && '🚴'}
                              </span>
                              <span style={{fontSize:'13px',color:opt.mode === item.mode ? '#fff' : '#888',textTransform:'capitalize'}}>
                                {opt.mode}
                              </span>
                            </div>
                            <div style={{fontSize:'13px',color:opt.mode === item.mode ? '#fff' : '#888'}}>
                              {opt.duration} min • {(opt.distance / 1000).toFixed(1)} km
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                
                <button onClick={exitPlanning} style={{width:'100%',padding:'12px',background:'#fff',color:'#000',borderRadius:'8px',border:'none',fontWeight:'bold',marginTop:'16px',cursor:'pointer'}}>
                  Exit Planning
                </button>
              </div>
            ) : loadingDetails ? (
              <div className="p-5 space-y-4 animate-pulse">
                <div className="h-44 bg-muted rounded-lg"/>
                <div className="h-3 bg-muted rounded w-3/4"/>
                <div className="h-3 bg-muted rounded w-1/2"/>
              </div>
            ) : placeDetails ? (
              <div className="p-5 space-y-4">
                {/* Photos - now direct URLs from API */}
                {placeDetails.photos && placeDetails.photos.length > 0 && (
                  <div className="space-y-2">
                    <div className="h-44 rounded-lg overflow-hidden bg-muted">
                      <img 
                        src={placeDetails.photos[0]}
                        alt={placeDetails.displayName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                        }}
                      />
                    </div>
                    {placeDetails.photos.length > 1 && (
                      <div className="flex gap-2">
                        {placeDetails.photos.slice(1, 4).map((photo, i) => (
                          <div key={i} className="flex-1 h-16 rounded-md overflow-hidden bg-muted">
                            <img 
                              src={photo}
                              alt={`${placeDetails.displayName} ${i + 2}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Rating */}
                {placeDetails.rating && (
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400">★</span>
                    <span className="text-sm font-medium text-foreground">{placeDetails.rating.toFixed(1)}</span>
                    {placeDetails.userRatingCount && (
                      <span className="text-muted-foreground text-sm">
                        ({placeDetails.userRatingCount.toLocaleString()})
                      </span>
                    )}
                  </div>
                )}

                {/* Address */}
                <div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{placeDetails.formattedAddress}</p>
                </div>

                {/* Phone */}
                {placeDetails.phone && (
                  <a 
                    href={`tel:${placeDetails.phone}`}
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                    </svg>
                    {placeDetails.phone}
                  </a>
                )}

                {/* Website */}
                {placeDetails.website && (
                  <a 
                    href={placeDetails.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                    <span className="truncate">{placeDetails.website.replace(/^https?:\/\//, '')}</span>
                  </a>
                )}

                {/* Opening Hours */}
                {placeDetails.openingHours && placeDetails.openingHours.length > 0 && (
                  <details className="text-sm">
                    <summary className="text-muted-foreground cursor-pointer hover:text-foreground">Opening hours</summary>
                    <ul className="mt-2 space-y-0.5 text-muted-foreground">
                      {placeDetails.openingHours.map((day, i) => (
                        <li key={i}>{day}</li>
                      ))}
                    </ul>
                  </details>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  {isSignedIn && !planningMode && (
                    <button
                      onClick={() => {
                        setPlanningMode(true);
                        setSelectedPlaces([selectedPlace!.placeId]);
                        closeSidebar();
                      }}
                      className="flex-1 bg-foreground hover:bg-foreground/90 text-background text-center py-2.5 px-4 rounded-lg text-sm font-medium transition-colors"
                    >
                      Plan a Trip
                    </button>
                  )}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPlace?.lat},${selectedPlace?.lng}&destination_place_id=${placeDetails.placeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${isSignedIn && !planningMode ? 'flex-1' : 'flex-1'} bg-foreground hover:bg-foreground/90 text-background text-center py-2.5 px-4 rounded-lg text-sm font-medium transition-colors`}
                  >
                    Directions
                  </a>
                  <a
                    href={`https://www.google.com/maps/place/?q=place_id:${placeDetails.placeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${isSignedIn && !planningMode ? 'flex-1' : 'flex-1'} border border-border hover:bg-accent text-foreground text-center py-2.5 px-4 rounded-lg text-sm font-medium transition-colors`}
                  >
                    View on Maps
                  </a>
                </div>
              </div>
            ) : null}
          </div>

      </div>
      )}
  </div>
  );
}