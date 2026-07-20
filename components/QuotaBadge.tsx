"use client";

import { useEffect, useState } from "react";

interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
}

// Small "GNews quota remaining today" indicator. Re-fetched via `refreshKey` so
// it can update after a search spends a call. Silent if quota can't be loaded.
export function QuotaBadge({ refreshKey }: { refreshKey: number }) {
  const [quota, setQuota] = useState<QuotaStatus | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/quota")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) setQuota(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (!quota) return null;
  return (
    <p className="muted small">
      GNews quota: {quota.remaining}/{quota.limit} left today
    </p>
  );
}
