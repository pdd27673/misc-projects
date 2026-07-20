"use client";

import { useEffect, useState } from "react";

interface SourceInfo {
  id: string;
  displayName: string;
}

// Dropdown of enabled sources. Loads them from /api/sources and reports the
// selected id upward. Hidden until sources load; auto-selects the first one.
export function SourcePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (sourceId: string) => void;
}) {
  const [sources, setSources] = useState<SourceInfo[]>([]);

  useEffect(() => {
    fetch("/api/sources")
      .then((res) => res.json())
      .then((data: { sources: SourceInfo[] }) => {
        setSources(data.sources);
        // Default the selection to the first enabled source.
        if (data.sources[0] && !value) onChange(data.sources[0].id);
      })
      .catch(() => {});
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (sources.length === 0) return null;

  return (
    <label className="source-picker">
      <span className="muted small">Source</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
