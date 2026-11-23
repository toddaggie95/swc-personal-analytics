import test from 'node:test';
import assert from 'node:assert/strict';
import {liveProductionOrders} from './live-orders.mjs';
const manifest={destinations:[{id:'hub',kind:'hub',system:'Eberon',center:{x:5,y:10},target:{hasColumn:2,materialStartRow:12},memberStationUids:['s1']}]};
const stations=[{uid:'s1',system:'Eberon',sysX:'4',sysY:'9',type_name:'Shipyard III'}];
test('live spreadsheet ship change does not require JSON registry edit',()=>{
 const rowsBySystem={Eberon:[[],['Hub (5,10)'],['4,9','Endurance-Class Fleet Carrier','1','']]};
 assert.equal(liveProductionOrders({manifest,stations,rowsBySystem})[0].ship,'Endurance-Class Fleet Carrier');
});
test('rejects wrong live coordinates instead of guessing station',()=>{
 const rowsBySystem={Eberon:[[],['Hub (5,10)'],['5,9','TIE/in Interceptor','1','']]};
 assert.throws(()=>liveProductionOrders({manifest,stations,rowsBySystem}),/Unknown station coordinate/);
});
test('rejects missing station rows rather than silently excluding production',()=>{
 const rowsBySystem={Eberon:[[],['Hub (5,10)'],[]]};
 assert.throws(()=>liveProductionOrders({manifest,stations,rowsBySystem}),/coverage incomplete/);
});

test('vacant hub coordinate is allowed only when unassigned',()=>{
 const rowsBySystem={Eberon:[[],['Hub (5,10)'],['4,9','TIE/in Interceptor','1',''],['5,9','None','0','']]};
 assert.equal(liveProductionOrders({manifest,stations,rowsBySystem}).length,1);
 rowsBySystem.Eberon[3][1]='TIE/in Interceptor';
 assert.throws(()=>liveProductionOrders({manifest,stations,rowsBySystem}),/Unknown station coordinate/);
});

test('depot can be missing from production rows while its shipyard neighbors remain',()=>{
 const m={destinations:[{id:'depot-hub',kind:'hub',system:'Eberon',center:{x:5,y:10},target:{hasColumn:2,materialStartRow:12},memberStationUids:['s1','depot']}]};
 const st=[...stations,{uid:'depot',system:'Eberon',sysX:'5',sysY:'10',type_name:'Depot Station I'}];
 const rowsBySystem={Eberon:[[],['Hub (5,10)'],['4,9','TIE/in Interceptor','1','']]};
 assert.equal(liveProductionOrders({manifest:m,stations:st,rowsBySystem}).length,1);
});


test('edge hub tolerates unassigned negative coordinate placeholders',()=>{
 const m={destinations:[{id:'edge',kind:'hub',system:'Chamble',center:{x:0,y:12},target:{hasColumn:2,materialStartRow:12},memberStationUids:['s1']}]};
 const st=[{uid:'s1',system:'Chamble',sysX:'0',sysY:'12',type:'Shipyard IV'}];
 const rowsBySystem={Chamble:[[],['Hub (0,12)'],['-1,11','None','',''],['0,12','Behemoth-class Star Dreadnaught','1','']]};
 assert.equal(liveProductionOrders({manifest:m,stations:st,rowsBySystem}).length,1);
 rowsBySystem.Chamble[2][1]='TIE/in Interceptor';
 assert.throws(()=>liveProductionOrders({manifest:m,stations:st,rowsBySystem}),/Unknown station coordinate/);
});


test('Daluuj (4,1) registers all new construction shipyards as unassigned',()=>{
 const ids=['5:67168','5:67165','5:65571','5:67163','5:56605'];
 const positions=[[4,0],[5,0],[4,1],[5,1],[5,2]];
 const m={destinations:[{id:'Daluuj-hub-2-0',kind:'hub',system:'Daluuj',center:{x:4,y:1},target:{hasColumn:2,materialStartRow:47},memberStationUids:ids}]};
 const st=ids.map((uid,i)=>({uid,system:'Daluuj',sysX:String(positions[i][0]),sysY:String(positions[i][1]),type_name:i===2||i===4?'Depot Station I':'Shipyard I'}));
 const rows=Array.from({length:47},()=>[]);
 rows[36]=['TFF Daluuj Depot (4,1)'];
 const coords=['3,0','4,0','5,0','3,1','4,1','5,1','3,2','4,2','5,2'];
 coords.forEach((xy,i)=>{rows[37+i]=[xy,'None','','']});
 const result=liveProductionOrders({manifest:m,stations:st,rowsBySystem:{Daluuj:rows}});
 assert.equal(result.length,5);
 assert.deepEqual(result.filter(x=>['5:67168','5:67165','5:67163'].includes(ids[positions.findIndex(p=>p[0]===x.x&&p[1]===x.y)])).map(x=>x.ship),['None','None','None']);
 rows[38]=['4,0','TIE/in Interceptor','48',''];
 assert.equal(liveProductionOrders({manifest:m,stations:st,rowsBySystem:{Daluuj:rows}}).find(x=>x.x===4&&x.y===0).ship,'TIE/in Interceptor');
});
