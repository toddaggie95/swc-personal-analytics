/** Conservative serial pacing for SWC read-only GET requests.
 * No concurrency, no rate-limit bypass, no dependency on production workflows.
 */
export interface RateWindow {
  limit: number | null;
  remaining: number | null;
  resetAtMs: number | null;
}
const integer = (v: string | null): number | null =>
  v !== null && /^\d+$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : null;

export function parseRateWindow(headers: Headers, nowMs: number): RateWindow {
  const limit = integer(headers.get('x-ratelimit-limit'));
  const remaining = integer(headers.get('x-ratelimit-remaining'));
  const epoch = integer(headers.get('x-ratelimit-reset'));
  const resetTime = headers.get('x-ratelimit-resettime');
  const parsedDate = resetTime ? Date.parse(resetTime) : NaN;
  const resetAtMs = epoch !== null ? epoch * 1000 : Number.isFinite(parsedDate) ? parsedDate : null;
  return {
    limit,
    remaining: remaining !== null && (limit === null || remaining <= limit) ? remaining : null,
    resetAtMs: resetAtMs !== null && resetAtMs >= nowMs ? resetAtMs : null,
  };
}

export class ReadPacer {
  private readonly nextAllowedMs = new Map<string, number>();
  private readonly observed = new Map<string, RateWindow>();
  constructor(
    private readonly sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
    private readonly now: () => number = Date.now,
    private readonly fallbackDelayMs = 6500,
    private readonly maxWaitMs = 60_000,
  ) {}
  async beforeRequest(resource: string): Promise<void> {
    const now = this.now();
    const window = this.observed.get(resource);
    let next = this.nextAllowedMs.get(resource) ?? 0;
    if (window?.remaining === 0) {
      if (window.resetAtMs === null) throw new Error('SWC quota exhausted without a trustworthy reset; stop and resume later.');
      next = Math.max(next, window.resetAtMs + 1000);
    }
    if (window?.remaining !== null && window?.remaining !== undefined && window.remaining > 0 && window.resetAtMs !== null) {
      // Reserve one request; spread the remaining budget over the window.
      next = Math.max(next, now + Math.ceil((window.resetAtMs - now) / window.remaining));
    }
    const delay = Math.max(0, next - now);
    if (delay > this.maxWaitMs) throw new Error('SWC request pacing requires a long wait; stop and resume later.');
    if (delay) await this.sleep(delay);
    this.nextAllowedMs.set(resource, this.now() + this.fallbackDelayMs);
  }
  afterResponse(resource: string, headers: Headers): RateWindow {
    const now = this.now();
    const window = parseRateWindow(headers, now);
    this.observed.set(resource, window);
    // When headers are absent, retain conservative pacing rather than burst.
    this.nextAllowedMs.set(resource, now + this.fallbackDelayMs);
    return window;
  }
}
