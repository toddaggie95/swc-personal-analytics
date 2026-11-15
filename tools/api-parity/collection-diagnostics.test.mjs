import test from 'node:test';
import assert from 'node:assert/strict';
import {failureCategory} from './collection-diagnostics.mjs';
test('diagnostics expose fixed labels and never exception contents',()=>{
 for(const [message,expected] of [
  ['OAuth refresh rejected by server (HTTP 400/401). secret','oauth-refresh-rejected'],
  ['SWC pacing requires a long wait','api-quota'],
  ['SWC request failed or timed out. secret','api-transport'],
  ['arbitrary token secret','unclassified'],
 ])assert.equal(failureCategory(Error(message),'station-read'),expected);
 assert.equal(failureCategory(Error('secret payload'),'station-contract'),'station-contract');
 assert.equal(failureCategory(null,'configuration'),'unclassified');
});
