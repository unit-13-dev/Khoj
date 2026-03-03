'use client';

import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error(error);
      setData({ error: 'Failed to fetch' });
    }
    setLoading(false);
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div style={{ 
        maxWidth: '500px', 
        width: '100%',
        padding: '32px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.02)'
      }}>
        <h1 style={{ 
          fontSize: '24px', 
          fontWeight: 'bold', 
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          Share Instagram Reel
        </h1>
        
        <form onSubmit={handleSubmit} style={{ marginBottom: '24px' }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter Instagram reel URL"
            required
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#fff',
              fontSize: '14px',
              outline: 'none'
            }}
          />
          <button 
            type="submit" 
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              border: 'none',
              borderRadius: '8px',
              background: loading ? '#333' : '#fff',
              color: loading ? '#666' : '#000',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Loading...' : 'Get Metadata'}
          </button>
        </form>
        
        {data && (
          <div style={{
            padding: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.02)',
            maxHeight: '400px',
            overflow: 'auto'
          }}>
            <pre style={{ 
              fontSize: '12px', 
              lineHeight: '1.5',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
