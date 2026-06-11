'use client';

import { useState, useEffect } from 'react';
import type { SportEvent } from '../types';

export function useEvents() {
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/events')
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json() as Promise<SportEvent[]>;
      })
      .then(data => {
        setEvents(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return { events, loading };
}
