import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveHubMembership} from './hub-membership.mjs';
import {buildLedger} from './audited-inventory.mjs';
import {calculateOverviewSnapshot} from './overview-snapshot.mjs';
const station=(uid,x,y,extra={})=>({uid,system:'Daluuj',sector:'Albanin',sysX:String(x),sysY:String(y),type_name:'Shipyard I',owner_uid:'20:1838',underConstruction:'false',productionStatus:'',...extra});
const old=station('5:67191',4,0),fresh=station('5:67203',3,1,{underConstruction:'true'});
const d={id:'Daluuj-hub-2-0',kind:'hub',system:'Daluuj',center:{x:4,y:1},memberStationUids:[old.uid],underConstructionStationUids:[old.uid],target:{sheet:'Daluuj',hasColumn:2,materialStartRow:13}};
const manifest={destinations:[d]};
const resolve=(stations,m=manifest,source='api')=>resolveHubMembership(m,[['TJO',stations]],source);
test('Daluuj new shipyard is included in HAS, readiness and coverage; stale construction clears',()=>{
 const outside=station('5:99999',9,9),asteroid=station('5:99998',3,1,{system:'Asteroid Field 1'});
 const stations=[old,fresh,outside,asteroid];
 const result=resolve(stations);
 assert.deepEqual(result.manifest.destinations[0].memberStationUids,[old.uid,fresh.uid]);
 assert.deepEqual(result.manifest.destinations[0].underConstructionStationUids,[fresh.uid]);
 assert.equal(result.discovered[0].uid,fresh.uid);
 assert.deepEqual(manifest.destinations[0].memberStationUids,[old.uid]);
 const materials=[{uid:'16:1',type_name:'meleenium',quantity:'100',container_uid:fresh.uid,container_type_name:'Stations',system:'Daluuj'}];
 assert.equal(buildLedger(result.manifest,stations,materials).destinations[0].totals.meleenium,100);
 const rowsBySystem={Daluuj:[[],[],['Hub (4,1)'],['4,0','TIE','1',''],['3,1','None','','']]};
 const shipRows=[['Ship type',...Array(28).fill(''),'Raw materials'],['TIE',...Array(28).fill(''),'Meleenium: 10']];
 const overview=calculateOverviewSnapshot({manifest:result.manifest,stations,materials,rowsBySystem,shipRows});
 assert.equal(overview.orders.find(o=>o.id===fresh.uid).status,'unassigned');
 assert.equal(overview.orders.find(o=>o.id===old.uid).status,'ready_now');
 assert.deepEqual(overview.coverageAudit.uncoveredShipyards.map(s=>s.uid),[outside.uid]);
 assert.deepEqual(overview.coverageAudit.untrackedSystemShipyards.map(s=>s.uid),[asteroid.uid]);
});
test('fail closed on invalid owner, coordinate, occupied slot, unknown construction, overlapping geometry',()=>{
 for(const changes of [{owner_uid:'20:1'},{sysX:''},{sysX:'4',sysY:'0'},{underConstruction:''}])assert.throws(()=>resolve([old,{...fresh,...changes}]));
 const second={...d,id:'other',center:{x:2,y:1},memberStationUids:[],underConstructionStationUids:[]};
 assert.throws(()=>resolve([old,fresh],{destinations:[d,second]}),/overlapping/);
});
test('unregistered non-production stations do not change the audited material pool',()=>{
 const depot={...fresh,type_name:'Depot Station I'};
 assert.equal(resolve([old,depot]).discovered.length,0);
});
test('manual CSV cannot infer construction for a new shipyard',()=>{
 assert.throws(()=>resolve([old,fresh],manifest,'csv'),/requires API/);
});

test('registered Daluuj (1,4) depot collects material and discovers both new shipyards',()=>{
 const depot=station('5:65569',1,4,{type_name:'Depot Station I'});
 const a=station('5:67266',0,3,{underConstruction:'true'});
 const b=station('5:67268',0,4,{underConstruction:'true'});
 const outside=station('5:99999',0,6);
 const hub={id:'Daluuj-hub-2-1',kind:'hub',system:'Daluuj',center:{x:1,y:4},memberStationUids:[depot.uid],target:{sheet:'Daluuj',hasColumn:6,materialStartRow:47}};
 const stations=[depot,a,b,outside];
 const result=resolve(stations,{destinations:[hub]});
 assert.deepEqual(result.manifest.destinations[0].memberStationUids,[depot.uid,a.uid,b.uid]);
 assert.deepEqual(result.manifest.destinations[0].underConstructionStationUids,[a.uid,b.uid]);
 assert.deepEqual(result.discovered.map(s=>s.uid),[a.uid,b.uid]);
 const materials=[{uid:'16:1',type_name:'meleenium',quantity:'100',container_uid:depot.uid,container_type_name:'Stations',system:'Daluuj'},{uid:'16:2',type_name:'meleenium',quantity:'50',container_uid:a.uid,container_type_name:'Stations',system:'Daluuj'}];
 assert.equal(buildLedger(result.manifest,stations,materials).destinations[0].totals.meleenium,150);
});
