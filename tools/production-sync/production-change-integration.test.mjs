import test from 'node:test';
import assert from 'node:assert/strict';
import {compareProductionSnapshots} from './production-change-report.mjs';
import {productionNotification} from './production-change-notification.mjs';
import {formatProductionChanges} from './production-change-format.mjs';

test('end-to-end change reporting detects start, stop, and readiness transitions',()=>{
 const base={schemaVersion:1,batchId:'previous',stations:[
  {uid:'101',system:'Kashyyyk',ship:'TIE',started:false,status:'idle',readiness:'blocked',quantity:1},
  {uid:'102',system:'Eberon',ship:'Endurance',started:true,status:'running',readiness:'building',quantity:1},
  {uid:'103',system:'Tholatin',ship:'A-wing',started:false,status:'idle',readiness:'blocked',quantity:1}
 ]};
 const current={schemaVersion:1,batchId:'current',stations:[
  {...base.stations[0],started:true,status:'running',readiness:'building'},
  {...base.stations[1],started:false,status:'idle',readiness:'blocked'},
  {...base.stations[2],readiness:'ready_now'}
 ]};
 const report={status:'compared',...compareProductionSnapshots(base,current)};
 const decision=productionNotification(report);
 assert.equal(decision.notify,true);
 assert.equal(decision.started,1);
 assert.equal(decision.stopped,1);
 assert.equal(decision.newlyReady,1);
 const text=formatProductionChanges(report);
 for(const system of ['Kashyyyk','Eberon','Tholatin'])assert.ok(text.includes('['+system+']'));
 assert.match(text,/production_activity_changed/);
});
