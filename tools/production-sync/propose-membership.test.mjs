import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeMembership} from './propose-membership.mjs';
const hub={id:'hub',kind:'hub',system:'Tholatin',memberStationUids:[],target:{sheet:'Tholatin',hasColumn:2,materialStartRow:13}};
const one={id:'solo',kind:'oneoff-group',system:'Tholatin',memberStationUids:['5:3'],target:{sheet:'Tholatin',hasColumn:2,materialStartRow:134}};
const st=(uid,x,type_name='Shipyard IV')=>({uid,system:'Tholatin',sysX:String(x),sysY:'13',type_name});
test('audited orders assign shipyards but not nearby factory/depot stations',()=>{
 const r=proposeMembership({destinations:[hub,one]},{orders:[{destinationId:'hub',system:'Tholatin',x:9,y:13}]},
 [st('5:1',9),st('5:2',9,'X7 Factory Station'),st('5:3',10)]);
 assert.deepEqual(r.destinations[0].memberStationUids,['5:1']);
 assert.deepEqual(r.destinations[1].memberStationUids,['5:3']);
 assert.equal(r.status,'REVIEW_REQUIRED');
});
test('unlisted shipyard remains visible instead of autoassigned',()=>{
 const r=proposeMembership({destinations:[hub]},{orders:[]},[st('5:4',9)]);
 assert.equal(r.unresolved.unlistedShipyards.length,1);
 assert.equal(r.statistics.emptyHubs,1);
});
