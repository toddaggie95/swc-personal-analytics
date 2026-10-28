import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateMaterialBalance} from './material-balance.mjs';
const pools=[
 {id:'A',system:'Kashyyyk',materials:{meleenium:100,quantum:5}},
 {id:'B',system:'Kashyyyk',materials:{meleenium:20}},
 {id:'C',system:'Eberon',materials:{meleenium:30,quantum:100}}
];
const orders=[
 {id:'1',system:'Kashyyyk',stationPoolId:'A',ship:'TIE',started:false,bill:{meleenium:150,quantum:2}},
 {id:'2',system:'Kashyyyk',stationPoolId:'B',ship:'TIE',started:true,bill:{meleenium:99999}},
 {id:'3',system:'Eberon',stationPoolId:'C',ship:'None',started:false,bill:{}}
];
test('counts physical inventory once, excludes started bills, reports every shortage',()=>{
 const x=calculateMaterialBalance({pools,orders,materials:['meleenium','quantum'],excessThresholds:{meleenium:1000,quantum:1000}});
 const k=x.systems.find(s=>s.system==='Kashyyyk').materials;
 assert.deepEqual(k.meleenium,{have:120,required:150,net:-30,missing:30,excess:0,showExcess:false});
 assert.equal(k.quantum.excess,3);
 assert.equal(x.visible.length,1);
 assert.deepEqual(x.visible[0],{system:'Kashyyyk',material:'meleenium',kind:'Missing',quantity:30});
 assert.equal(x.totals.have.meleenium,150);
 assert.equal(x.totals.required.meleenium,150);
 assert.equal(x.totals.missing.meleenium,30);
 assert.equal(x.totals.excess.meleenium,30);
 assert.equal(x.totals.net.meleenium,0);
});
test('horizontal and below-table use the same values; threshold is display-only',()=>{
 const x=calculateMaterialBalance({pools,orders,materials:['meleenium','quantum'],excessThresholds:{meleenium:1,quantum:4}});
 assert.equal(x.horizontal.find(s=>s.system==='Kashyyyk').excess.quantum,null);
 assert.equal(x.belowTable.some(r=>r.system==='Eberon'&&r.material==='quantum'&&r.quantity===100),true);
 assert.equal(x.totals.excess.quantum,103);
 assert.equal(x.totals.missing.meleenium,30);
});
test('median thresholds deterministic and bad data fail closed',()=>{
 const x=calculateMaterialBalance({pools,orders,materials:['meleenium','quantum']});
 assert.equal(x.thresholds.meleenium,30);
 assert.equal(x.thresholds.quantum,5);
 assert.throws(()=>calculateMaterialBalance({pools:[...pools,pools[0]],orders,materials:['meleenium','quantum']}),/duplicate inventory pool/);
 assert.throws(()=>calculateMaterialBalance({pools,orders:[...orders,orders[0]],materials:['meleenium','quantum']}),/Duplicate\/missing production order/);
});

test('inventory in untracked systems is excluded while same-system station inventory is retained',()=>{
 const expanded=[...pools,{id:'X',system:'Untracked',materials:{meleenium:999999}},{id:'D',system:'Kashyyyk',materials:{meleenium:10}}];
 const x=calculateMaterialBalance({pools:expanded,orders,materials:['meleenium','quantum'],excessThresholds:{meleenium:1,quantum:1}});
 assert.equal(x.statistics.systems,2);
 assert.equal(x.systems.some(s=>s.system==='Untracked'),false);
 assert.equal(x.systems.find(s=>s.system==='Kashyyyk').materials.meleenium.have,130);
 assert.equal(x.totals.have.meleenium,160);
});
