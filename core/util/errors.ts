// Narrow, named error types so routes can tell failure kinds apart instead of
// catching one generic Error. Each maps to a specific HTTP status (see below).

// A required piece of configuration (env var) is missing — this is our fault, 500.
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

// An external API (news source or OpenAI) failed — upstream's fault, 502.
export class UpstreamError extends Error {
  constructor(
    public readonly source: string,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

// Maps an error to the HTTP status a route should return for it.
export function httpStatusFor(err: unknown): number {
  if (err instanceof ConfigError) return 500;
  if (err instanceof UpstreamError) return 502;
  return 500;
}
