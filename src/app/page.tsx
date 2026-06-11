'use client';

import { useMemo } from 'react';
import { useEvents } from '@/lib/gametime/hooks/useEvents';
import { LiveNowRail } from '@/components/gametime/LiveNowRail';
import { EventCard } from '@/components/gametime/EventCard';
import { FilterBar } from '@/components/gametime/FilterBar';
import { useFilters, usePrefs } from '@/lib/gametime/context/AppContext';
import { applyFilters, findConflicts, sortEvents } from '@/lib/gametime/normalizers';
import { groupByLocalDate } from '@/lib/gametime/time';
import Link from 'next/link';

function QuickNav() {
  const items = [
    { href: '/today', label: 'Today', icon: '☀', desc: 'All events today' },
    { href: '/week', label: 'This Week', icon: '📅', desc: 'Plan ahead' },
    { href: '/guide', label: 'EPG Guide', icon: '▤', desc: 'Timeline view' },
    { href: '/channels', label: 'Channels', icon: '📺', desc: 'Browse by broadcaster' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
      {items.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl border border-gt-border bg-gt-surface hover:border-gt-accent/40 hover:bg-gt-surface-hover transition-colors text-center"
        >
          <span className="text-xl leading-none">{item.icon}</span>
          <span className="text-xs font-semibold text-gt-text">{item.label}</span>
          <span className="text-[10px] text-gt-muted">{item.desc}</span>
        </Link>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { events, loading } = useEvents();
  const { filters } = useFilters();
  const prefs = usePrefs();
  const tz = prefs.timezone || 'UTC';

  const liveEvents = useMemo(() => events.filter(e => e.isLive), [events]);

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    const cutoff = now + 4 * 60 * 60 * 1000;
    return events.filter(e => !e.isLive && new Date(e.startTimeUtc).getTime() >= now && new Date(e.startTimeUtc).getTime() <= cutoff);
  }, [events]);

  const allEvents = useMemo(() => sortEvents(applyFilters(events, filters)), [events, filters]);

  const todayEvents = useMemo(() => {
    const groups = groupByLocalDate(allEvents, tz);
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    return (groups[todayKey] ?? []) as typeof allEvents;
  }, [allEvents, tz]);

  const conflicts = useMemo(() => findConflicts(allEvents), [allEvents]);

  const hasFilters = filters.sports.length > 0 || filters.showLiveOnly || filters.freeOnly || filters.streamingOnly;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gt-muted">
        <p className="text-sm">Loading schedule…</p>
      </div>
    );
  }

  return (
    <div>
      <LiveNowRail events={liveEvents} />
      {!hasFilters && <QuickNav />}
      <FilterBar />

      {!hasFilters && upcomingEvents.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gt-text">Up Next</h2>
            <span className="text-xs text-gt-muted">Next 4 hours</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {upcomingEvents.slice(0, 4).map(event => (
              <EventCard key={event.id} event={event} hasConflict={conflicts.has(event.id)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gt-text">
            {hasFilters ? 'Filtered Events' : "Today's Schedule"}
          </h2>
          <Link href="/today" className="text-xs text-gt-accent hover:underline">Full schedule →</Link>
        </div>
        {todayEvents.length === 0 ? (
          <div className="text-center py-12 text-gt-muted">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm">No events match your filters</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {todayEvents.map(event => (
              <EventCard key={event.id} event={event} hasConflict={conflicts.has(event.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
