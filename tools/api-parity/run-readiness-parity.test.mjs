import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCapturedReadiness} from './run-readiness-parity.mjs';

test('fail closed on incomplete workbook capture',()=>{
  assert.throws(()=>compareCapturedReadiness({},[],[],[],[]),/Snapshot requires/);
  assert.throws(()=>compareCapturedReadiness({manifest:{destinations:[]},rowsBySystem:{Kashyyyk:[]},shipRows:[]},[],[],[],[]),/No Kashyyyk destinations/);
});
