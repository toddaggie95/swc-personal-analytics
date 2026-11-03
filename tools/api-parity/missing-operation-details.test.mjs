import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRetryManifest} from './missing-operation-details.mjs';
test('only incomplete shipyards are requested',()=>{
 const report=buildRetryManifest({tff:[{uid:'5:1',typeName:'Depot',operations:{}}],tjo:[
  {uid:'5:3',typeName:'Shipyard I',operations:{productionActions:[],tooledTo:'TIE'}},
  {uid:'5:2',typeName:'Shipyard II',operations:{productionActions:null,tooledTo:'TIE'}},
  {uid:'5:4',typeName:'Shipyard III',operations:{productionActions:[],tooledTo:null}}
 ]});
 assert.deepEqual(report.requests.map(x=>x.uid),['5:2','5:4']);
 assert.deepEqual(report.requests[0].missing,['productionActions']);
 assert.equal(report.coverage.status,'blocked_incomplete_operations');
});
test('duplicate UID fails closed',()=>{
 assert.throws(()=>buildRetryManifest({tjo:[{uid:'5:1',typeName:'Shipyard'},{uid:'5:1',typeName:'Shipyard'}]}),/duplicate/);
});
