'use client';

import { useMemo } from 'react';
import { useEvents } from '@/lib/gametime/hooks/useEvents';
import { EventCard } from '@/components/gametime/EventCard';
import type { Broadcaster, SportEvent } from '@/lib/gametime/types';

function ChannelSection({ broadcaster, events }: { broadcaster: Broadcaster; events: SportEvent[] }) {
  if (events.length === 0) return null;
  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-2 h-6 rounded-full shrink-0"
          style={{ backgroundColor: broadcaster.color ?? '#64748b' }}
        />
        <div>
          <h2 className="text-sm font-bold text-gt-text">{broadcaster.name}</h2>
          <p className="text-xs text-gt-muted capitalize">{broadcaster.type} · {broadcaster.country ?? 'Global'}</p>
        </div>
        {broadcaster.isFree && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
            Free
          </span>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {events.map(event => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}

export default function ChannelsPage() {
  const { events, loading } = useEvents();

  const channelMap = useMemo(() => {
    const map = new Map<string, { broadcaster: Broadcaster; events: SportEvent[] }>();
    for (const event of events) {
      for (const b of event.broadcasters) {
        if (!map.has(b.id)) map.set(b.id, { broadcaster: b, events: [] });
        map.get(b.id)!.events.push(event);
      }
    }
    return map;
  }, [events]);

  const sortedChannels = useMemo(() =>
    Array.from(channelMap.values()).sort((a, b) => {
      if (a.broadcaster.isFree && !b.broadcaster.isFree) return -1;
      if (!a.broadcaster.isFree && b.broadcaster.isFree) return 1;
      return a.broadcaster.name.localeCompare(b.broadcaster.name);
    }),
  [channelMap]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gt-text mb-1">Channels & Platforms</h1>
        <p className="text-sm text-gt-muted">Browse upcoming events by broadcaster</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gt-muted">
          <p className="text-sm">Loading channels…</p>
        </div>
      ) : sortedChannels.length === 0 ? (
        <div className="text-center py-16 text-gt-muted">
          <div className="text-4xl mb-3">📺</div>
          <p className="text-sm">No broadcaster data available</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {sortedChannels.map(({ broadcaster: b }) => (
              <a
                key={b.id}
                href={`#${b.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-gt-border bg-gt-surface hover:border-gt-accent/40 text-gt-muted hover:text-gt-text transition-colors"
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: b.color ?? '#64748b' }} />
                {b.shortName ?? b.name}
                {b.isFree && <span className="text-emerald-400">✓</span>}
              </a>
            ))}
          </div>

          {sortedChannels.map(({ broadcaster, events: channelEvents }) => (
            <div key={broadcaster.id} id={broadcaster.id}>
              <ChannelSection broadcaster={broadcaster} events={channelEvents} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
