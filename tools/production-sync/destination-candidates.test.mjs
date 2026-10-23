import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateMembership} from './destination-candidates.mjs';
const d=(id,x)=>({id,kind:'hub',system:'Kashyyyk',center:{x,y:10}});
const s=(uid,x,type_name='Shipyard I')=>({uid,system:'Kashyyyk',sysX:String(x),sysY:'10',type_name});
test('candidate proximity never becomes approved membership',()=>{
 const r=candidateMembership({destinations:[d('a',5)]},[s('5:1',5)]);
 assert.deepEqual(r.hubCandidates[0].memberStationUids,undefined);
 assert.deepEqual(r.hubCandidates[0].candidateShipyardUids,['5:1']);
});
test('overlap explicitly recorded and standalone UID excluded',()=>{
 const r=candidateMembership({destinations:[d('a',5),d('b',6),{id:'solo',kind:'oneoff-group',system:'Kashyyyk',memberStationUids:['5:2']}]},[s('5:1',5),s('5:2',5)]);
 assert.deepEqual(r.hubCandidates[0].ambiguousStationUids,['5:1']);
 assert.ok(!r.hubCandidates[0].candidateStationUids.includes('5:2'));
 assert.equal(r.statistics.ambiguousHubs,2);
});
