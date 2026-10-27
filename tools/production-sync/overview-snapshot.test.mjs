import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateOverviewSnapshot} from './overview-snapshot.mjs';
test('full snapshot connects sheet order to hub inventory without writes',()=>{
 const manifest={destinations:[{id:'Eberon-hub-1-0',kind:'hub',title:'Hub (5,10)',center:{x:5,y:10},target:{hasColumn:2,materialStartRow:12},system:'Eberon',memberStationUids:['s1','s2']}]};
 const stations=[{uid:'s1',system:'Eberon',sysX:'4',sysY:'9'},{uid:'s2',system:'Eberon',sysX:'5',sysY:'10'}];
 const materials=[{uid:'p1',type_name:'Meleenium',quantity:'480',container_type_name:'Stations',container_uid:'s2',system:'Eberon'}];
 const auditedOrders=[{destinationId:'Eberon-hub-1-0',system:'Eberon',x:4,y:9,ship:'TIE/in Interceptor',row:2}];
 const rowsBySystem={Eberon:[[],['Hub (5,10)'],['4,9','TIE/in Interceptor','48','']]};
 const shipRows=[['Ship type',...Array(28).fill(''),'Raw materials'],['TIE/in Interceptor',...Array(28).fill(''),'Meleenium: 10']];
 const result=calculateOverviewSnapshot({manifest,stations,materials,auditedOrders,rowsBySystem,shipRows});
 assert.equal(result.systems.Eberon.ready_now,1);
 assert.equal(result.reservations[0].sourcePoolId,'s2');
 assert.equal(result.statistics.auditedOrders,1);
});
