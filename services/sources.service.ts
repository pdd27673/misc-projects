import { sources } from "@/core/sources/registry";

export interface SourceInfo {
  id: string;
  displayName: string;
}

// The enabled sources, as the UI's source picker needs them (id + label only).
export function listSources(): SourceInfo[] {
  return sources.map((s) => ({ id: s.id, displayName: s.displayName }));
}
