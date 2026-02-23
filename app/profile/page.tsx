'use client';

import { useUser } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { UserReelWithPlace } from '../types';
import Link from 'next/link';

export default function ProfilePage() {
  const { user, isLoaded, isSignedIn } = useUser();
  const [reels, setReels] = useState<UserReelWithPlace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      window.location.href = '/auth';
      return;
    }

    async function fetchReels() {
      try {
        const response = await axios.get('/api/user/reels');
        setReels(response.data);
      } catch (error) {
        console.error('Failed to fetch reels:', error);
      }
      setLoading(false);
    }

    if (isLoaded && isSignedIn) {
      fetchReels();
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  return (
    <div style={{maxWidth:'100%',overflowX:'hidden'}}>
      <div style={{display:'flex',gap:'16px',alignItems:'center',padding:'24px',borderBottom:'1px solid #333'}}>
        <img src={user?.imageUrl} alt="Profile" style={{width:'60px',height:'60px',borderRadius:'50%'}}/>
        <div>
          <div style={{fontSize:'20px',fontWeight:'bold'}}>{user?.firstName} {user?.lastName}</div>
          <div style={{color:'#888'}}>{user?.primaryEmailAddress?.emailAddress}</div>
        </div>
      </div>

      <div style={{padding:'24px',maxWidth:'100%'}}>
        <div style={{display:'flex',gap:'16px',marginBottom:'24px'}}>
          <Link href="/map" style={{flex:1,padding:'16px',background:'#1a1a1a',border:'1px solid #333',borderRadius:'8px',textDecoration:'none',textAlign:'center'}}>
            <div style={{fontSize:'24px',marginBottom:'8px'}}>🗺️</div>
            <div style={{fontSize:'16px',fontWeight:'bold',color:'#fff'}}>Map</div>
            <div style={{fontSize:'12px',color:'#888'}}>View saved places</div>
          </Link>
          <Link href="/planner" style={{flex:1,padding:'16px',background:'#1a1a1a',border:'1px solid #333',borderRadius:'8px',textDecoration:'none',textAlign:'center'}}>
            <div style={{fontSize:'24px',marginBottom:'8px'}}>✈️</div>
            <div style={{fontSize:'16px',fontWeight:'bold',color:'#fff'}}>Plan Trip</div>
            <div style={{fontSize:'12px',color:'#888'}}>AI trip planner</div>
          </Link>
        </div>

        <h2 style={{fontSize:'18px',fontWeight:'bold',marginBottom:'16px'}}>Saved Reels</h2>
        
        {reels.length === 0 ? (
          <div style={{textAlign:'center',padding:'48px'}}>
            <p style={{color:'#888',marginBottom:'16px'}}>No reels saved yet</p>
            <Link href="/" style={{display:'inline-block',background:'#fff',color:'#000',padding:'8px 16px',borderRadius:'4px',textDecoration:'none'}}>
              Save Your First Reel
            </Link>
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 250px))',gap:'16px',justifyContent:'center'}}>
            {reels.map((reel) => (
              <div key={reel.shortCode} style={{border:'1px solid #333',borderRadius:'4px',padding:'16px',minWidth:0,maxWidth:'250px'}}>
                <div style={{fontSize:'16px',fontWeight:'bold',marginBottom:'12px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {reel.validation ? 'Place Found' : 'No Location'}
                </div>
                <a href={reel.url} target="_blank" rel="noopener noreferrer" style={{display:'block',marginBottom:'12px'}}>
                  <img 
                    src={reel.thumbnail || '/reel-thumbnail-placeholder.jpg'} 
                    alt="Reel" 
                    style={{width:'100%',aspectRatio:'9/16',maxHeight:'350px',objectFit:'cover',borderRadius:'4px',cursor:'pointer',background:'#222',display:'block'}}
                    onError={(e) => { (e.target as HTMLImageElement).src = '/reel-thumbnail-placeholder.jpg'; }}
                  />
                </a>
                <p style={{fontSize:'14px',color:'#ccc',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:'12px'}}>
                  {reel.caption || 'No caption'}
                </p>
                {reel.validation && reel.placeId && (
                  <Link href={`/map?place=${reel.placeId}`} style={{fontSize:'14px',color:'#888',textDecoration:'none',display:'block',textAlign:'center',padding:'8px',border:'1px solid #333',borderRadius:'4px'}}>
                    View on Map
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
