'use client';

import { useState, useRef, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter, useParams } from 'next/navigation';
import axios from 'axios';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  places?: any[];
}

interface Place {
  placeId: string;
  name: string;
  type: string;
  rating: number;
  address: string;
  source: string;
}

export default function PlannerPage() {
  const { user, isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const params = useParams();
  const sessionIdFromUrl = typeof params.sessionId === 'string' ? params.sessionId : null;
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(sessionIdFromUrl);
  const [approvedPlaces, setApprovedPlaces] = useState<Place[]>([]);
  const [sessionTitle, setSessionTitle] = useState('Trip Planning');
  const [finalItinerary, setFinalItinerary] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);

  // Debug finalItinerary changes
  useEffect(() => {
    console.log('=== FRONTEND: finalItinerary state changed ===');
    console.log('FRONTEND: finalItinerary:', finalItinerary);
    console.log('FRONTEND: Has items?', !!finalItinerary?.items);
    console.log('FRONTEND: Items count:', finalItinerary?.items?.length);
  }, [finalItinerary]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/auth');
      return;
    }

    // Load existing session if sessionId is in URL
    if (isLoaded && isSignedIn && sessionIdFromUrl && messages.length === 0) {
      loadExistingSession(sessionIdFromUrl);
    } else if (isLoaded && isSignedIn && !sessionIdFromUrl && messages.length === 0) {
      // Show welcome message for new sessions
      setMessages([{
        role: 'assistant',
        content: "Hi! I'm your AI trip planner. Tell me where you'd like to travel and I'll help you create the perfect itinerary. For example: 'I want to visit West Bengal for 5 days in March'",
        timestamp: new Date()
      }]);
    }
  }, [isLoaded, isSignedIn, router, sessionIdFromUrl, messages.length]);

  const loadExistingSession = async (sessionId: string) => {
    try {
      console.log('=== FRONTEND: Loading existing session ===');
      const response = await axios.get(`/api/planner/session?sessionId=${sessionId}`);
      const sessionData = response.data;
      
      console.log('FRONTEND: Session data received:', sessionData);
      
      setSessionId(sessionId);
      if (sessionData.title) {
        setSessionTitle(sessionData.title);
      }
      
      // Load approved places from session
      if (sessionData.approvedPlaces && sessionData.approvedPlaces.length > 0) {
        console.log('FRONTEND: Loading approved places:', sessionData.approvedPlaces);
        
        // Fetch place details for approved places
        try {
          const placesResponse = await axios.post('/api/planner/approved-places', {
            placeIds: sessionData.approvedPlaces
          });
          
          console.log('FRONTEND: Approved places details:', placesResponse.data.places);
          setApprovedPlaces(placesResponse.data.places);
        } catch (error) {
          console.error('FRONTEND: Failed to load approved places:', error);
        }
      }
      
      // Load finalized itinerary if available
      if (sessionData.finalizedItinerary) {
        console.log('FRONTEND: Loading finalized itinerary:', sessionData.finalizedItinerary);
        setFinalItinerary(sessionData.finalizedItinerary);
      }
      
      // Load conversation history if available
      if (sessionData.conversationHistory && Array.isArray(sessionData.conversationHistory)) {
        // Convert timestamp strings to Date objects
        const messagesWithDates = sessionData.conversationHistory.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
        setMessages(messagesWithDates);
      } else {
        // Show welcome message if no history
        setMessages([{
          role: 'assistant',
          content: "Welcome back! Continue planning your trip or start a new conversation.",
          timestamp: new Date()
        }]);
      }
      
      console.log('Session loaded:', sessionId);
    } catch (error) {
      console.error('Failed to load session:', error);
      // Show welcome message on error
      setMessages([{
        role: 'assistant',
        content: "Hi! I'm your AI trip planner. Tell me where you'd like to travel and I'll help you create the perfect itinerary.",
        timestamp: new Date()
      }]);
    }
  };

  // Update URL when session ID changes
  useEffect(() => {
    if (sessionId && !sessionIdFromUrl) {
      router.replace(`/planner/${sessionId}`, { scroll: false });
    }
  }, [sessionId, sessionIdFromUrl, router]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (shouldScrollRef.current) {
      scrollToBottom();
    }
    // Reset to true after scroll
    shouldScrollRef.current = true;
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    console.log('Form submitted, input:', input);

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      console.log('=== FRONTEND: Sending request ===');
      console.log('Messages:', [...messages, userMessage]);
      console.log('UserId:', user?.id);
      console.log('SessionId:', sessionId);

      const response = await axios.post('/api/planner/chat', {
        messages: [...messages, userMessage],
        userId: user?.id,
        sessionId
      });

      console.log('=== FRONTEND: Response received ===');
      console.log('Full response.data:', JSON.stringify(response.data, null, 2));
      console.log('response.data.places:', response.data.places);
      console.log('Places is array?', Array.isArray(response.data.places));
      console.log('Places length:', response.data.places?.length);

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.data.message,
        timestamp: new Date(),
        places: response.data.places
      };

      console.log('=== FRONTEND: Assistant message created ===');
      console.log('assistantMessage.places:', assistantMessage.places);
      console.log('Has places?', !!assistantMessage.places);

      setMessages(prev => {
        const newMessages = [...prev, assistantMessage];
        console.log('=== FRONTEND: Messages updated ===');
        console.log('New messages array:', newMessages);
        console.log('Last message places:', newMessages[newMessages.length - 1].places);
        return newMessages;
      });

      if (response.data.sessionId) {
        setSessionId(response.data.sessionId);
        console.log('Session ID set:', response.data.sessionId);
      }

      if (response.data.sessionTitle) {
        setSessionTitle(response.data.sessionTitle);
        console.log('Session title updated:', response.data.sessionTitle);
      }

      // Handle finalization
      if (response.data.finalized) {
        console.log('=== FRONTEND: Finalization triggered ===');
        console.log('FRONTEND: Calling handleFinalizeItinerary...');
        await handleFinalizeItinerary();
        console.log('FRONTEND: handleFinalizeItinerary completed');
      } else {
        console.log('FRONTEND: No finalization flag in response');
      }
    } catch (error) {
      console.error('Chat error:', error);
      if (axios.isAxiosError(error)) {
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date()
      }]);
    }

    setLoading(false);
  };

  const handlePlaceAction = async (placeId: string, action: 'approve' | 'reject', place: Place, messageIndex: number) => {
    if (!sessionId) return;

    try {
      // Prevent auto-scroll when updating place actions
      shouldScrollRef.current = false;
      
      // Make backend API call to save the action
      await axios.post('/api/planner/discover', {
        action,
        sessionId,
        placeId
      });

      if (action === 'approve') {
        // Update the message's places array to mark this place as approved
        setMessages(prev => {
          const updated = [...prev];
          if (updated[messageIndex]?.places) {
            updated[messageIndex] = {
              ...updated[messageIndex],
              places: updated[messageIndex].places!.map(p => 
                p.placeId === placeId ? { ...p, isApproved: true } : p
              )
            };
          }
          return updated;
        });
        
        // Also add to approved places list
        setApprovedPlaces(prev => [...prev, place]);
      } else {
        // Remove from the message's places array (skip)
        setMessages(prev => {
          const updated = [...prev];
          if (updated[messageIndex]?.places) {
            updated[messageIndex] = {
              ...updated[messageIndex],
              places: updated[messageIndex].places!.filter(p => p.placeId !== placeId)
            };
          }
          return updated;
        });
      }

      // Don't add any new messages - just update the UI
    } catch (error) {
      console.error('Place action error:', error);
      // Reset scroll flag on error
      shouldScrollRef.current = true;
    }
  };

  const handleFinalizeItinerary = async () => {
    if (!sessionId) {
      console.error('Cannot finalize: no sessionId');
      return;
    }

    try {
      console.log('=== FRONTEND: Calling finalize endpoint ===');
      console.log('SessionId:', sessionId);
      
      const response = await axios.post('/api/planner/finalize', { sessionId });
      
      console.log('=== FRONTEND: Finalize response received ===');
      console.log('Response data:', response.data);
      console.log('Itinerary:', response.data.itinerary);
      console.log('Items count:', response.data.itinerary?.items?.length);
      
      setFinalItinerary(response.data.itinerary);
      console.log('Final itinerary state set');
    } catch (error) {
      console.error('Finalize error:', error);
      if (axios.isAxiosError(error)) {
        console.error('Error response:', error.response?.data);
      }
    }
  };

  if (!isLoaded || !isSignedIn) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>
        <div>Loading...</div>
      </div>
    );
  }

  console.log('=== FRONTEND: Rendering PlannerPage ===');
  console.log('FRONTEND: finalItinerary exists?', !!finalItinerary);
  console.log('FRONTEND: Will render final itinerary card?', !!finalItinerary);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'#000'}}>
      {/* Header */}
      <div style={{padding:'16px 24px',borderBottom:'1px solid #333',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontSize:'20px',fontWeight:'bold',marginBottom:'4px'}}>{sessionTitle}</h1>
          <p style={{fontSize:'14px',color:'#888'}}>Plan your perfect journey with AI</p>
        </div>
        <div style={{display:'flex',gap:'12px'}}>
          <button 
            onClick={() => router.push('/planner')}
            style={{padding:'8px 16px',background:'#1a1a1a',border:'1px solid #333',borderRadius:'6px',cursor:'pointer',color:'#fff'}}
          >
            ← Back to Home
          </button>
          <button 
            onClick={() => router.push('/map')}
            style={{padding:'8px 16px',background:'#1a1a1a',border:'1px solid #333',borderRadius:'6px',cursor:'pointer',color:'#fff'}}
          >
            View Map
          </button>
        </div>
      </div>

      {/* Main Content Area - Split into Chat and Sidebar */}
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>
        {/* Chat Area (Left) */}
        <div style={{flex:1,overflowY:'auto',padding:'24px'}}>
          <div style={{maxWidth:'800px',margin:'0 auto'}}>
            {messages.map((msg, idx) => {
            console.log(`=== RENDERING message ${idx} ===`);
            console.log('Message role:', msg.role);
            console.log('Message has places?', !!msg.places);
            console.log('Message places:', msg.places);
            console.log('Places length:', msg.places?.length);
            
            return (
            <div key={idx}>
              {/* Show place cards BEFORE the assistant message */}
              {msg.places && msg.places.length > 0 && msg.role === 'assistant' && (
                <div style={{marginBottom:'16px',position:'relative'}}>
                  <div style={{fontSize:'14px',fontWeight:'bold',marginBottom:'12px',color:'#fff'}}>
                    Suggested Places ({msg.places.length})
                  </div>
                  
                  {/* Navigation Buttons */}
                  <button
                    onClick={() => {
                      const container = document.getElementById(`carousel-${idx}`);
                      if (container) container.scrollBy({ left: -220, behavior: 'smooth' });
                    }}
                    style={{
                      position:'absolute',
                      left:'-12px',
                      top:'50%',
                      transform:'translateY(-50%)',
                      width:'40px',
                      height:'40px',
                      borderRadius:'50%',
                      background:'rgba(255,255,255,0.9)',
                      border:'none',
                      cursor:'pointer',
                      fontSize:'20px',
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'center',
                      zIndex:10,
                      boxShadow:'0 2px 8px rgba(0,0,0,0.3)'
                    }}
                  >
                    ‹
                  </button>
                  
                  <button
                    onClick={() => {
                      const container = document.getElementById(`carousel-${idx}`);
                      if (container) container.scrollBy({ left: 220, behavior: 'smooth' });
                    }}
                    style={{
                      position:'absolute',
                      right:'-12px',
                      top:'50%',
                      transform:'translateY(-50%)',
                      width:'40px',
                      height:'40px',
                      borderRadius:'50%',
                      background:'rgba(255,255,255,0.9)',
                      border:'none',
                      cursor:'pointer',
                      fontSize:'20px',
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'center',
                      zIndex:10,
                      boxShadow:'0 2px 8px rgba(0,0,0,0.3)'
                    }}
                  >
                    ›
                  </button>
                  
                  <div 
                    id={`carousel-${idx}`}
                    style={{
                      display:'flex',
                      gap:'12px',
                      overflowX:'auto',
                      paddingBottom:'12px',
                      scrollbarWidth:'thin',
                      scrollbarColor:'#333 #0a0a0a',
                      scrollBehavior:'smooth'
                    }}
                  >
                    {msg.places.map((place: any) => {
                      console.log('Rendering place card:', place.name);
                      // Photo URL is already fetched from backend
                      const photoUrl = place.photoUrl;
                      
                      // Check if place is already approved (from backend flag only)
                      const isKept = place.isApproved || false;
                      
                      return (
                      <div key={place.placeId} style={{
                        minWidth:'200px',
                        maxWidth:'200px',
                        background:'#1a1a1a',
                        border: isKept ? '2px solid #fb923c' : '1px solid #333',
                        borderRadius:'12px',
                        overflow:'hidden',
                        cursor:'pointer',
                        transition:'transform 0.2s',
                        position:'relative',
                        opacity: isKept ? 0.8 : 1
                      }}
                      onMouseEnter={(e) => !isKept && (e.currentTarget.style.transform = 'scale(1.02)')}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        {/* Square Image */}
                        <div style={{
                          width:'200px',
                          height:'200px',
                          backgroundImage: photoUrl ? `url(${photoUrl})` : 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
                          backgroundSize:'cover',
                          backgroundPosition:'center',
                          position:'relative',
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'center'
                        }}>
                          {!photoUrl && (
                            <div style={{fontSize:'48px',opacity:0.3}}>🏛️</div>
                          )}
                          
                          {/* Instagram Tag */}
                          {place.source === 'instagram' && (
                            <div style={{
                              position:'absolute',
                              top:'8px',
                              left:'8px',
                              padding:'4px 8px',
                              background:'rgba(225, 48, 108, 0.9)',
                              borderRadius:'6px',
                              fontSize:'11px',
                              fontWeight:'bold',
                              color:'#fff'
                            }}>
                              📸 Your Save
                            </div>
                          )}
                          
                          {/* Rating Badge */}
                          {place.rating > 0 && (
                            <div style={{
                              position:'absolute',
                              bottom:'8px',
                              right:'8px',
                              padding:'4px 8px',
                              background:'rgba(0, 0, 0, 0.8)',
                              borderRadius:'6px',
                              fontSize:'12px',
                              fontWeight:'bold',
                              color:'#ffa500'
                            }}>
                              ⭐ {place.rating.toFixed(1)}
                            </div>
                          )}
                        </div>
                        
                        {/* Place Info */}
                        <div style={{padding:'12px'}}>
                          <div style={{
                            fontSize:'14px',
                            fontWeight:'bold',
                            marginBottom:'4px',
                            whiteSpace:'nowrap',
                            overflow:'hidden',
                            textOverflow:'ellipsis'
                          }}>
                            {place.name}
                          </div>
                          <div style={{
                            fontSize:'12px',
                            color:'#888',
                            marginBottom:'8px',
                            textTransform:'capitalize'
                          }}>
                            {place.type.replace(/_/g, ' ')}
                          </div>
                          
                          {/* Action Buttons */}
                          <div style={{display:'flex',gap:'6px'}}>
                            {isKept ? (
                              <div style={{
                                flex:1,
                                padding:'6px',
                                background:'#fb923c',
                                color:'#000',
                                borderRadius:'6px',
                                fontSize:'12px',
                                fontWeight:'bold',
                                textAlign:'center'
                              }}>
                                ✓ Added to Itinerary
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => handlePlaceAction(place.placeId, 'approve', place, idx)}
                                  style={{
                                    flex:1,
                                    padding:'6px',
                                    background:'#fff',
                                    color:'#000',
                                    border:'none',
                                    borderRadius:'6px',
                                    cursor:'pointer',
                                    fontSize:'12px',
                                    fontWeight:'bold'
                                  }}
                                >
                                  ✓ Keep
                                </button>
                                <button
                                  onClick={() => handlePlaceAction(place.placeId, 'reject', place, idx)}
                                  style={{
                                    flex:1,
                                    padding:'6px',
                                    background:'#333',
                                    color:'#fff',
                                    border:'1px solid #555',
                                    borderRadius:'6px',
                                    cursor:'pointer',
                                    fontSize:'12px'
                                  }}
                                >
                                  ✗ Skip
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              )}

              {/* Then show the assistant message */}
              <div 
                style={{
                  marginBottom:'16px',
                  display:'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                <div style={{
                  maxWidth:'70%',
                  padding:'12px 16px',
                  borderRadius:'12px',
                  background: msg.role === 'user' ? '#fff' : '#1a1a1a',
                  color: msg.role === 'user' ? '#000' : '#fff',
                  border: msg.role === 'assistant' ? '1px solid #333' : 'none'
                }}>
                  <div style={{fontSize:'14px',lineHeight:'1.5',whiteSpace:'pre-wrap'}}>
                    {msg.content}
                  </div>
                  <div style={{
                    fontSize:'11px',
                    color: msg.role === 'user' ? '#666' : '#666',
                    marginTop:'4px'
                  }}>
                    {msg.timestamp instanceof Date 
                      ? msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                      : new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                    }
                  </div>
                </div>
              </div>
            </div>
          )})}
          {loading && (
            <div style={{display:'flex',justifyContent:'flex-start',marginBottom:'16px'}}>
              <div style={{
                padding:'12px 16px',
                borderRadius:'12px',
                background:'#1a1a1a',
                border:'1px solid #333'
              }}>
                <div style={{display:'flex',gap:'4px'}}>
                  <div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#666',animation:'pulse 1.5s ease-in-out infinite'}}></div>
                  <div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#666',animation:'pulse 1.5s ease-in-out 0.2s infinite'}}></div>
                  <div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#666',animation:'pulse 1.5s ease-in-out 0.4s infinite'}}></div>
                </div>
              </div>
            </div>
          )}
          
          {/* Final Itinerary Card - Shown at the bottom after all messages */}
          {finalItinerary && finalItinerary.daySchedules && (
            <div style={{marginBottom:'24px',marginTop:'32px'}}>
              {/* Header */}
              <div style={{padding:'24px',background:'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',border:'2px solid #fb923c',borderRadius:'16px 16px 0 0',boxShadow:'0 4px 20px rgba(251, 146, 60, 0.2)'}}>
                <div style={{fontSize:'24px',fontWeight:'bold',marginBottom:'8px',color:'#fb923c'}}>
                  ✓ Your {finalItinerary.days}-Day Trip is Ready!
                </div>
                <div style={{fontSize:'18px',fontWeight:'bold',marginBottom:'8px',color:'#fff'}}>
                  {finalItinerary.title}
                </div>
                <div style={{fontSize:'14px',color:'#888',marginBottom:'0'}}>
                  {finalItinerary.totalPlaces} places • {finalItinerary.days} days • {finalItinerary.destination}
                </div>
              </div>
              
              {/* Day-by-Day Schedule */}
              <div style={{background:'#0a0a0a',padding:'20px',borderLeft:'2px solid #fb923c',borderRight:'2px solid #fb923c'}}>
                {finalItinerary.daySchedules.map((daySchedule: any, dayIndex: number) => (
                  <div key={daySchedule.day} style={{marginBottom: dayIndex < finalItinerary.daySchedules.length - 1 ? '48px' : '0'}}>
                    {/* Day Header */}
                    <div style={{
                      padding:'16px 20px',
                      background:'linear-gradient(135deg, #fb923c 0%, #f97316 100%)',
                      color:'#000',
                      borderRadius:'12px',
                      marginBottom:'24px',
                      fontWeight:'bold',
                      fontSize:'18px'
                    }}>
                      📅 Day {daySchedule.day} {daySchedule.date ? `- ${daySchedule.date}` : ''}
                      <div style={{fontSize:'14px',fontWeight:'normal',marginTop:'4px',opacity:0.8}}>
                        {daySchedule.places.length} places • {daySchedule.totalDuration} min • {daySchedule.totalDistance.toFixed(2)} km
                      </div>
                    </div>
                    
                    {/* Timeline with Place Cards */}
                    {daySchedule.places.map((item: any, index: number) => (
                      <div key={`${daySchedule.day}-${item.place.placeId}-${index}`} style={{
                        marginBottom: index < daySchedule.places.length - 1 ? '32px' : '0',
                        position:'relative'
                      }}>
                        {/* Time Badge */}
                        <div style={{
                          display:'inline-block',
                          padding:'8px 16px',
                          background:'#fb923c',
                          color:'#000',
                          borderRadius:'20px',
                          fontSize:'14px',
                          fontWeight:'bold',
                          marginBottom:'12px'
                        }}>
                          🕐 {item.arrivalTime} - {item.departureTime}
                        </div>
                        
                        {/* Place Card */}
                        <div style={{
                          background:'#1a1a1a',
                          border:'1px solid #333',
                          borderRadius:'12px',
                          overflow:'hidden',
                          display:'flex',
                          gap:'16px'
                        }}>
                          {/* Photo */}
                          {item.photoUrl && (
                            <div style={{width:'200px',height:'150px',flexShrink:0}}>
                              <img 
                                src={item.photoUrl} 
                                alt={item.place.displayName}
                                style={{width:'100%',height:'100%',objectFit:'cover'}}
                              />
                            </div>
                          )}
                          
                          {/* Details */}
                          <div style={{flex:1,padding:'16px'}}>
                            <div style={{fontSize:'18px',fontWeight:'bold',marginBottom:'8px',color:'#fff'}}>
                              {item.place.displayName}
                            </div>
                            <div style={{fontSize:'14px',color:'#888',marginBottom:'8px'}}>
                              📍 {item.place.formattedAddress}
                            </div>
                            <div style={{fontSize:'14px',color:'#fb923c',marginBottom:'8px'}}>
                              ⏱️ {item.duration} minutes • {item.timeSlot}
                            </div>
                            {item.travelTime > 0 && (
                              <div style={{fontSize:'14px',color:'#888',marginBottom:'8px'}}>
                                🚶 {item.travelTime} min travel ({item.distanceFromPrevious.toFixed(2)} km from previous)
                              </div>
                            )}
                            <div style={{fontSize:'14px',color:'#fff',fontStyle:'italic'}}>
                              💡 {item.suggestion}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              
              {/* Footer */}
              <div style={{padding:'20px',background:'#1a1a1a',border:'2px solid #fb923c',borderRadius:'0 0 16px 16px',borderTop:'none'}}>
                <div style={{fontSize:'14px',color:'#888',textAlign:'center'}}>
                  🎉 Have an amazing trip! Save this itinerary or share it with your travel companions.
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Approved Places Sidebar (Right) */}
        <div style={{
          width:'320px',
          borderLeft:'1px solid #333',
          background:'#0a0a0a',
          overflowY:'auto',
          display:'flex',
          flexDirection:'column'
        }}>
          {/* Sidebar Header */}
          <div style={{padding:'20px',borderBottom:'1px solid #333',position:'sticky',top:0,background:'#0a0a0a',zIndex:10}}>
            <div style={{fontSize:'18px',fontWeight:'bold',marginBottom:'8px'}}>
              Your Itinerary
            </div>
            <div style={{fontSize:'14px',color:'#888',marginBottom:'12px'}}>
              {approvedPlaces.length} {approvedPlaces.length === 1 ? 'place' : 'places'} selected
            </div>
            {approvedPlaces.length >= 3 && (
              <button
                onClick={handleFinalizeItinerary}
                style={{
                  width:'100%',
                  padding:'10px',
                  background:'#fb923c',
                  color:'#000',
                  border:'none',
                  borderRadius:'8px',
                  cursor:'pointer',
                  fontSize:'14px',
                  fontWeight:'bold'
                }}
              >
                ✓ Finalize Itinerary
              </button>
            )}
          </div>

          {/* Approved Places List */}
          <div style={{flex:1,padding:'16px'}}>
            {approvedPlaces.length === 0 ? (
              <div style={{textAlign:'center',padding:'40px 20px',color:'#666'}}>
                <div style={{fontSize:'48px',marginBottom:'16px'}}>📍</div>
                <div style={{fontSize:'14px',lineHeight:'1.6'}}>
                  No places added yet.<br/>
                  Keep places from suggestions to build your itinerary.
                </div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                {approvedPlaces.map((place, index) => (
                  <div key={place.placeId} style={{
                    background:'#1a1a1a',
                    border:'1px solid #333',
                    borderRadius:'10px',
                    overflow:'hidden',
                    transition:'border-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#fb923c'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#333'}
                  >
                    {/* Place Number Badge */}
                    <div style={{
                      padding:'8px 12px',
                      background:'#fb923c',
                      color:'#000',
                      fontSize:'12px',
                      fontWeight:'bold'
                    }}>
                      #{index + 1}
                    </div>
                    
                    <div style={{padding:'12px'}}>
                      <div style={{fontSize:'14px',fontWeight:'bold',marginBottom:'6px',color:'#fff'}}>
                        {place.name}
                      </div>
                      <div style={{fontSize:'12px',color:'#888',marginBottom:'8px',textTransform:'capitalize'}}>
                        {place.type.replace(/_/g, ' ')}
                      </div>
                      {place.rating > 0 && (
                        <div style={{fontSize:'12px',color:'#ffa500',marginBottom:'8px'}}>
                          ⭐ {place.rating.toFixed(1)}
                        </div>
                      )}
                      {place.source === 'instagram' && (
                        <div style={{fontSize:'11px',color:'#e1306c',marginBottom:'8px'}}>
                          📸 From your saves
                        </div>
                      )}
                      
                      {/* Remove Button */}
                      <button
                        onClick={async () => {
                          if (!sessionId) return;
                          try {
                            // Call API to remove from approved places
                            await axios.post('/api/planner/discover', {
                              action: 'remove',
                              sessionId,
                              placeId: place.placeId
                            });
                            
                            // Update local state
                            setApprovedPlaces(prev => prev.filter(p => p.placeId !== place.placeId));
                            
                            // Update messages to unmark this place
                            setMessages(prev => prev.map(msg => {
                              if (msg.places) {
                                return {
                                  ...msg,
                                  places: msg.places.map(p => 
                                    p.placeId === place.placeId ? { ...p, isApproved: false } : p
                                  )
                                };
                              }
                              return msg;
                            }));
                          } catch (error) {
                            console.error('Failed to remove place:', error);
                          }
                        }}
                        style={{
                          width:'100%',
                          padding:'6px',
                          background:'#333',
                          color:'#fff',
                          border:'1px solid #555',
                          borderRadius:'6px',
                          cursor:'pointer',
                          fontSize:'12px'
                        }}
                      >
                        ✗ Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input */}
      <div style={{padding:'16px 24px',borderTop:'1px solid #333'}}>
        <form onSubmit={handleSubmit} style={{maxWidth:'800px',margin:'0 auto'}}>
          <div style={{display:'flex',gap:'12px'}}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={loading}
              style={{
                flex:1,
                padding:'12px 16px',
                background:'#1a1a1a',
                border:'1px solid #333',
                borderRadius:'8px',
                color:'#fff',
                fontSize:'14px',
                outline:'none'
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                padding:'12px 24px',
                background: loading || !input.trim() ? '#333' : '#fff',
                color: loading || !input.trim() ? '#666' : '#000',
                border:'none',
                borderRadius:'8px',
                fontWeight:'bold',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer'
              }}
            >
              Send
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
