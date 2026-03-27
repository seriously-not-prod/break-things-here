import React, { useEffect, useState, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

interface Event {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_date: string;
  end_date: string;
  capacity: number | null;
  created_at: string;
}

const App: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/events`);
      if (!response.ok) throw new Error('Failed to fetch events');
      const data: Event[] = await response.json();
      setEvents(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: '#1a1a2e', marginBottom: '0.5rem' }}>
          Festival Event Planner
        </h1>
        <p style={{ color: '#555' }}>Plan and manage your festival events</p>
      </header>

      <main>
        {loading && <p>Loading events...</p>}
        {error && (
          <p role="alert" style={{ color: '#d32f2f', padding: '1rem', background: '#ffeaea', borderRadius: '4px' }}>
            {error}
          </p>
        )}
        {!loading && !error && events.length === 0 && (
          <p style={{ color: '#555', textAlign: 'center', padding: '2rem' }}>
            No events yet. Create your first festival event!
          </p>
        )}
        {events.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0 }} aria-label="Festival events">
            {events.map((event) => (
              <li
                key={event.id}
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  marginBottom: '1rem',
                  background: '#fafafa',
                }}
              >
                <h2 style={{ margin: '0 0 0.5rem', color: '#1a1a2e' }}>{event.title}</h2>
                {event.description && <p style={{ color: '#555' }}>{event.description}</p>}
                <div style={{ display: 'flex', gap: '1.5rem', color: '#777', fontSize: '0.9rem' }}>
                  {event.location && <span aria-label="Location">📍 {event.location}</span>}
                  <span aria-label="Date">
                    📅 {new Date(event.start_date).toLocaleDateString()}
                  </span>
                  {event.capacity && <span aria-label="Capacity">👥 {event.capacity}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
};

export default App;
