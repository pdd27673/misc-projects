import { getUsage } from "@/core/db/quota.model";
import { GNEWS_DAILY_LIMIT } from "@/core/sources/gnews";

export interface QuotaStatus {
  source: string;
  used: number;
  limit: number;
  remaining: number;
}

// GNews is the only rate-limited source we track. Returns today's usage vs. its limit.
export async function getGnewsQuota(): Promise<QuotaStatus> {
  const used = await getUsage("gnews");
  return {
    source: "gnews",
    used,
    limit: GNEWS_DAILY_LIMIT,
    remaining: Math.max(0, GNEWS_DAILY_LIMIT - used),
  };
}
