import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRateWindow, ReadPacer } from '../src/swc/read-pacer.js';

test('rate window reads successful-response quota headers', () => {
  const h = new Headers({ 'X-RateLimit-Limit': '600', 'X-RateLimit-Remaining': '598',
    'X-RateLimit-Reset': '2000000000' });
  assert.deepEqual(parseRateWindow(h, 1_999_999_000_000),
    { limit: 600, remaining: 598, resetAtMs: 2_000_000_000_000 });
});
test('invalid remaining count is not trusted', () => {
  const h = new Headers({ 'X-RateLimit-Limit': '600', 'X-RateLimit-Remaining': '999' });
  assert.equal(parseRateWindow(h, Date.now()).remaining, null);
});
test('unknown headers retain conservative fallback pacing', async () => {
  let now = 100_000;
  const waits: number[] = [];
  const pacer = new ReadPacer(async ms => { waits.push(ms); now += ms; }, () => now);
  pacer.afterResponse('inventory/stations', new Headers());
  await pacer.beforeRequest('inventory/stations');
  assert.deepEqual(waits, [6500]);
});
test('zero remaining quota stops before long reset wait', async () => {
  let now = 100_000;
  const pacer = new ReadPacer(async ms => { now += ms; }, () => now);
  pacer.afterResponse('inventory/stations', new Headers({
    'x-ratelimit-limit': '600', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '300'
  }));
  await assert.rejects(pacer.beforeRequest('inventory/stations'), /long wait/);
});
