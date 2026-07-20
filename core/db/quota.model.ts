import { Schema, model, models } from "mongoose";
import { connectToDb } from "./connect";

// Tracks how many calls we've made to a rate-limited source per UTC day, so the
// UI can show "quota remaining today". One document per (source, day).
export interface QuotaDoc {
  source: string;
  day: string; // YYYY-MM-DD (UTC)
  count: number;
}

const quotaSchema = new Schema<QuotaDoc>({
  source: { type: String, required: true },
  day: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
});
// One counter per source per day.
quotaSchema.index({ source: 1, day: 1 }, { unique: true });

const Quota = models.Quota ?? model<QuotaDoc>("Quota", quotaSchema);

const today = () => new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

// Atomically increment today's counter for a source (upsert on first call of the day).
export async function recordCall(source: string): Promise<void> {
  await connectToDb();
  await Quota.updateOne({ source, day: today() }, { $inc: { count: 1 } }, { upsert: true });
}

// How many calls the source has made today.
export async function getUsage(source: string): Promise<number> {
  await connectToDb();
  const doc = await Quota.findOne({ source, day: today() }).lean<QuotaDoc | null>();
  return doc?.count ?? 0;
}
